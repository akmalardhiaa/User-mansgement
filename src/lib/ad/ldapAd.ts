import { accessProfileGroups } from "@/lib/lifecycle/accessProfiles";

import {
  ldapConnector,
  type LdapAdConfig,
  type LdapChange,
  type LdapClientLike,
  type LdapConnect,
} from "./ldapConnection";
import { containerOf, dnEquals, escapeDnValue, isManaged, rdnOf } from "./ldapDn";
import {
  ACCOUNT_ATTRIBUTES,
  BINARY_ATTRIBUTES,
  accountFromEntry,
  firstString,
  managerDnOf,
  parseUserAccountControl,
  stringList,
  withEnabled,
  type DirectoryEntry,
} from "./ldapEntry";
import { toAdError, type LdapPhase } from "./ldapErrors";
import {
  accountNameFilter,
  anyUserFilter,
  groupFilter,
  groupMembersFilter,
  guidBaseDn,
} from "./ldapFilter";
import {
  AdError,
  type AdAccountState,
  type AdAttributePatch,
  type AdCreateSpec,
  type AdDriver,
} from "./types";

/**
 * Active Directory over LDAPS, as the worker sees it.
 *
 * The interface this implements was written for a real directory — see
 * types.ts — so this driver adds no capability and takes none away. What it
 * adds is the translation, and the translation is where the work is:
 *
 *   - objectGUID is sixteen bytes here and a canonical string everywhere else
 *     (ldapGuid.ts).
 *   - `enabled` is one bit of userAccountControl, and the other bits belong to
 *     somebody else (ldapEntry.ts).
 *   - `manager` is a DN in the directory and a sAMAccountName in this
 *     application, which costs one extra search in each direction.
 *   - `ou` is derived from the distinguishedName, not stored separately.
 *   - `groups` is only what the access catalogue issues. A membership added by
 *     hand is not this application's to report or to revoke.
 *
 * Two safety rails sit in front of every write, and neither is a
 * configuration-time check that could be true when the request is raised and
 * false when it runs:
 *
 *   1. `AD_LDAP_WRITE_ENABLED` must be true. Otherwise every write refuses
 *      before a connection is even opened, and reads keep working — which is
 *      the state to run in while a deployment is being verified.
 *   2. The object being changed, and any OU it is moved into, must sit inside
 *      `AD_MANAGED_OUS`. Group membership is bounded differently and more
 *      tightly: only the exact group DNs the access catalogue publishes, so
 *      this driver cannot add somebody to a group it was never told about even
 *      if that group lives in a managed container.
 *
 * A connection is opened, bound and closed per operation. A pooled client would
 * save a handshake per step; it would also mean a socket that died quietly
 * between two steps of the same request fails the second one for reasons that
 * have nothing to do with it. The worker performs a handful of operations per
 * request, so the handshake is not the cost worth optimising.
 */

/** ADS_UF_NORMAL_ACCOUNT. Paired with ACCOUNTDISABLE for a new account. */
const NORMAL_ACCOUNT = 0x200;
const ACCOUNTDISABLE = 0x2;

/** The object classes a user account is created with. */
const USER_OBJECT_CLASS = ["top", "person", "organizationalPerson", "user"];

export class LdapAdDriver implements AdDriver {
  readonly name = "ldap";

  /**
   * `connect` is injectable so the driver can be tested against a fake
   * directory. Nothing in the application passes it: the default is the real
   * LDAPS connector, and a test that forgets to substitute one therefore fails
   * by trying to reach a domain controller rather than by silently passing.
   */
  constructor(
    private readonly config: LdapAdConfig,
    private readonly connect: LdapConnect = ldapConnector(config),
  ) {}

  /* ---------------------------------------------------------------- reading */

  async findByAccountName(sAMAccountName: string): Promise<AdAccountState | undefined> {
    return this.run(`mencari akun ${sAMAccountName}`, async ({ client }) => {
      const entry = await this.findOne(
        client,
        accountNameFilter(sAMAccountName),
        `sAMAccountName ${sAMAccountName}`,
      );
      return entry ? this.toAccount(client, entry) : undefined;
    });
  }

  async findByGuid(objectGUID: string): Promise<AdAccountState | undefined> {
    return this.run(`membaca objek ${objectGUID}`, async ({ client }) => {
      const entry = await this.byGuid(client, objectGUID);
      return entry ? this.toAccount(client, entry) : undefined;
    });
  }

  /**
   * Everyone in a group, as the directory states it now.
   *
   * A group DN nobody recognises is reported as NOT_FOUND rather than as a
   * group with no members. The difference matters: this is how the CISO team is
   * resolved at submit, and "the group is empty" and "that DN is a typo" lead
   * to completely different conversations.
   *
   * Disabled accounts and accounts without a mailbox are left out — somebody
   * who cannot sign in cannot approve, and somebody with no address cannot be
   * asked.
   */
  async listGroupMembers(groupDn: string): Promise<AdAccountState[]> {
    return this.run(`membaca anggota group ${groupDn}`, async ({ client }) => {
      const found = await client.search(this.config.baseDn, {
        scope: "sub",
        filter: groupFilter(groupDn),
        attributes: ["distinguishedName"],
      });
      if (found.length === 0) {
        throw new AdError("NOT_FOUND", `Group ${groupDn} tidak ditemukan di direktori.`);
      }

      const entries = await client.search(this.config.baseDn, {
        scope: "sub",
        filter: groupMembersFilter(groupDn, { nested: this.config.nestedGroups }),
        attributes: ACCOUNT_ATTRIBUTES,
        binaryAttributes: BINARY_ATTRIBUTES,
        pageSize: this.config.pageSize,
      });

      // One manager lookup per distinct DN, not per member: a team of twelve
      // reporting to the same person is one extra search, not twelve.
      const managers = new Map<string, string | undefined>();
      const members: AdAccountState[] = [];
      for (const entry of entries) {
        const account = await this.toAccount(client, entry, managers);
        if (account.enabled && account.mail.trim()) members.push(account);
      }

      return members.sort((left, right) =>
        left.sAMAccountName.localeCompare(right.sAMAccountName),
      );
    });
  }

  async listAccounts(baseDn: string): Promise<AdAccountState[]> {
    return this.run(`membaca akun di ${baseDn}`, async ({ client }) => {
      const entries = await client.search(baseDn, {
        scope: "sub",
        filter: anyUserFilter(),
        attributes: ACCOUNT_ATTRIBUTES,
        binaryAttributes: BINARY_ATTRIBUTES,
        pageSize: this.config.pageSize,
      });

      /*
       * Group membership is not what this read is for, and the access
       * catalogue may not be configured yet in the read-only phase - when
       * asking it would throw. Reading the people must not depend on it.
       */
      let managedGroups: string[] = [];
      try {
        managedGroups = accessProfileGroups.all();
      } catch {
        managedGroups = [];
      }

      const managers = new Map<string, string | undefined>();
      const accounts: AdAccountState[] = [];
      for (const entry of entries) {
        accounts.push(await this.toAccount(client, entry, managers, managedGroups));
      }
      return accounts.sort((left, right) => left.sAMAccountName.localeCompare(right.sAMAccountName));
    });
  }

  /* ---------------------------------------------------------------- writing */

  async createAccount(spec: AdCreateSpec): Promise<AdAccountState> {
    this.assertWritable(`membuat akun ${spec.sAMAccountName}`);
    this.assertManagedContainer(spec.ou, "OU tempat akun dibuat");

    return this.run(`membuat akun ${spec.sAMAccountName}`, async ({ client, writing }) => {
      const clash = await this.findOne(
        client,
        accountNameFilter(spec.sAMAccountName),
        `sAMAccountName ${spec.sAMAccountName}`,
      );
      if (clash) {
        // Not transient, and not something to retry around: a second account
        // for the same person is the failure this guards against.
        throw new AdError("CONFLICT", `Akun ${spec.sAMAccountName} sudah ada di direktori.`);
      }

      const manager = spec.manager
        ? await this.requireManagerDn(client, spec.manager)
        : undefined;

      const dn = `CN=${escapeDnValue(spec.displayName)},${spec.ou}`;
      const entry: Record<string, string | string[]> = {
        objectClass: USER_OBJECT_CLASS,
        cn: spec.displayName,
        sAMAccountName: spec.sAMAccountName,
        /*
         * Created disabled, always, and with no password.
         *
         * This driver never writes password material — not unicodePwd, not a
         * generated secret, not PASSWD_NOTREQD to sidestep the policy. So if
         * the domain requires a password before an account may be enabled, the
         * `enable-account` step will be refused by the directory and the
         * request fails with the directory's own reason attached. That is the
         * intended outcome: the account exists, disabled and harmless, and
         * whoever owns password issuance sets one before the step is retried.
         */
        userAccountControl: String(NORMAL_ACCOUNT | ACCOUNTDISABLE),
      };

      // Empty values are omitted rather than written: AD refuses an attribute
      // whose value is an empty string, and it refuses the whole add with it.
      const optional: Record<string, string | undefined> = {
        userPrincipalName: spec.userPrincipalName,
        displayName: spec.displayName,
        givenName: spec.givenName,
        sn: spec.sn,
        mail: spec.mail,
        department: spec.department,
        title: spec.title,
        manager,
      };
      for (const [attribute, value] of Object.entries(optional)) {
        if (value && value.trim()) entry[attribute] = value;
      }

      writing();
      await client.add(dn, entry);

      const created = await this.findOne(
        client,
        accountNameFilter(spec.sAMAccountName),
        `sAMAccountName ${spec.sAMAccountName}`,
      );
      if (!created) {
        throw new AdError(
          "TIMEOUT_AFTER_WRITE",
          `Akun ${spec.sAMAccountName} dibuat tetapi tidak bisa dibaca ulang. Periksa direktori sebelum mencoba lagi.`,
        );
      }
      return this.toAccount(client, created);
    });
  }

  async setAttributes(objectGUID: string, patch: AdAttributePatch): Promise<void> {
    this.assertWritable(`mengubah atribut ${objectGUID}`);

    await this.run(`mengubah atribut ${objectGUID}`, async ({ client, writing }) => {
      const entry = await this.requireEntry(client, objectGUID);
      const dn = dnOf(entry);
      this.assertManagedContainer(containerOf(dn), "Objek yang diubah");

      const changes: LdapChange[] = [];
      const set = (attribute: string, value: string | undefined) => {
        if (value === undefined) return;
        if (value.trim() === "") {
          // Clearing an attribute that is already absent is an error in LDAP,
          // and "leave it as it is" is what the caller meant either way.
          if (firstString(entry[attribute])) {
            changes.push({ operation: "delete", attribute, values: [] });
          }
          return;
        }
        changes.push({ operation: "replace", attribute, values: [value] });
      };

      set("displayName", patch.displayName);
      set("department", patch.department);
      set("title", patch.title);
      set("mail", patch.mail);

      if (patch.manager !== undefined) {
        if (patch.manager.trim() === "") {
          if (managerDnOf(entry)) {
            changes.push({ operation: "delete", attribute: "manager", values: [] });
          }
        } else {
          const managerDn = await this.requireManagerDn(client, patch.manager);
          changes.push({ operation: "replace", attribute: "manager", values: [managerDn] });
        }
      }

      if (changes.length === 0) return;
      writing();
      await client.modify(dn, changes);
    });
  }

  /**
   * Adds group memberships, idempotently.
   *
   * The membership is written on the GROUP, which is where AD keeps it, and
   * only for groups already held is nothing sent — so a retry of a step that
   * half-succeeded does not trip over its own earlier success.
   */
  async addGroups(objectGUID: string, groups: readonly string[]): Promise<void> {
    await this.changeGroups(objectGUID, groups, "add");
  }

  async removeGroups(objectGUID: string, groups: readonly string[]): Promise<void> {
    await this.changeGroups(objectGUID, groups, "delete");
  }

  async moveToOu(objectGUID: string, ou: string): Promise<void> {
    this.assertWritable(`memindahkan ${objectGUID}`);
    this.assertManagedContainer(ou, "OU tujuan");

    await this.run(`memindahkan ${objectGUID} ke ${ou}`, async ({ client, writing }) => {
      const entry = await this.requireEntry(client, objectGUID);
      const dn = dnOf(entry);
      const current = containerOf(dn);
      this.assertManagedContainer(current, "OU asal");

      // Already there. A modifyDN to the same DN is refused by AD, and the
      // caller asked for a state, not for an operation.
      if (dnEquals(current, ou)) return;

      writing();
      await client.modifyDn(dn, `${rdnOf(dn)},${ou}`);
    });
  }

  async enableAccount(objectGUID: string): Promise<void> {
    await this.setEnabled(objectGUID, true);
  }

  async disableAccount(objectGUID: string): Promise<void> {
    await this.setEnabled(objectGUID, false);
  }

  /* ----------------------------------------------------------------- guards */

  private assertWritable(what: string): void {
    if (this.config.writeEnabled) return;
    throw new AdError(
      "PERMISSION",
      `Penulisan ke Active Directory dimatikan, jadi ${what} tidak dijalankan. Set AD_LDAP_WRITE_ENABLED=true bila driver ini sudah diverifikasi.`,
    );
  }

  private assertManagedContainer(dn: string, what: string): void {
    if (isManaged(dn, this.config.managedOus)) return;
    throw new AdError(
      "PERMISSION",
      `${what} (${dn}) berada di luar AD_MANAGED_OUS, jadi tidak ada yang ditulis.`,
    );
  }

  /**
   * Group DNs are checked against the access catalogue, not against the OU
   * allow-list.
   *
   * Group objects usually live in a container this application has no business
   * writing anything else in, so an OU rule would either block every grant or
   * open that whole container. The catalogue is an exact list of the groups
   * this application issues, which is a stricter answer and the one the rest of
   * the system already reasons about.
   */
  private assertCatalogueGroups(groups: readonly string[]): void {
    const issued = accessProfileGroups.all();
    const stranger = groups.find((group) => !issued.some((known) => dnEquals(known, group)));
    if (stranger) {
      throw new AdError(
        "PERMISSION",
        `Group ${stranger} tidak diterbitkan katalog akses, jadi driver ini tidak menyentuhnya.`,
      );
    }
  }

  /* ---------------------------------------------------------------- plumbing */

  /**
   * Runs one operation on a freshly bound connection.
   *
   * `writing()` is called immediately before a write leaves, and that is the
   * only thing that distinguishes a lost connection which changed nothing from
   * one which may have changed everything. Without it a dropped socket after a
   * modify would be classified as retryable, and the retry would be the second
   * application of an approved change.
   */
  private async run<T>(
    what: string,
    body: (context: { client: LdapClientLike; writing: () => void }) => Promise<T>,
  ): Promise<T> {
    let phase: LdapPhase = "read";
    let client: LdapClientLike | undefined;

    try {
      client = await this.connect();
      return await body({
        client,
        writing: () => {
          phase = "write";
        },
      });
    } catch (error) {
      throw toAdError(error, phase, what);
    } finally {
      await client?.close();
    }
  }

  private async findOne(
    client: LdapClientLike,
    filter: string,
    what: string,
  ): Promise<DirectoryEntry | undefined> {
    const entries = await client.search(this.config.baseDn, {
      scope: "sub",
      filter,
      attributes: ACCOUNT_ATTRIBUTES,
      binaryAttributes: BINARY_ATTRIBUTES,
    });

    if (entries.length > 1) {
      // Both keys this looks up by are unique in AD. More than one match means
      // the search base spans two directories, and acting on "the first one"
      // would be acting on whichever the server happened to return first.
      throw new AdError(
        "CONFLICT",
        `${what} cocok dengan ${entries.length} objek di ${this.config.baseDn}. Persempit AD_BASE_DN.`,
      );
    }
    return entries[0];
  }

  /**
   * One object, by GUID, read straight from its extended DN.
   *
   * A GUID nobody holds makes the server answer noSuchObject, which is a
   * failure for a write and merely an absence for a lookup — so it is turned
   * back into `undefined` here and thrown by `requireEntry` instead.
   */
  private async byGuid(
    client: LdapClientLike,
    objectGUID: string,
  ): Promise<DirectoryEntry | undefined> {
    try {
      const entries = await client.search(guidBaseDn(objectGUID), {
        scope: "base",
        filter: anyUserFilter(),
        attributes: ACCOUNT_ATTRIBUTES,
        binaryAttributes: BINARY_ATTRIBUTES,
      });
      return entries[0];
    } catch (error) {
      const classified = toAdError(error, "read", `membaca objek ${objectGUID}`);
      if (classified.kind === "NOT_FOUND") return undefined;
      throw classified;
    }
  }

  private async requireEntry(client: LdapClientLike, objectGUID: string): Promise<DirectoryEntry> {
    const entry = await this.byGuid(client, objectGUID);
    if (!entry) {
      throw new AdError("NOT_FOUND", `Objek ${objectGUID} tidak ditemukan di direktori.`);
    }
    return entry;
  }

  private async toAccount(
    client: LdapClientLike,
    entry: DirectoryEntry,
    managers = new Map<string, string | undefined>(),
    managedGroups?: readonly string[],
  ): Promise<AdAccountState> {
    const managerDn = managerDnOf(entry);
    let manager: string | undefined;

    if (managerDn) {
      if (!managers.has(managerDn)) {
        managers.set(managerDn, await this.accountNameForDn(client, managerDn));
      }
      manager = managers.get(managerDn);
    }

    return accountFromEntry(entry, { managedGroups: managedGroups ?? accessProfileGroups.all(), manager });
  }

  /**
   * The account name for a DN.
   *
   * A manager who has been deleted since is reported as no manager rather than
   * failing the read: the worker compares the manager it expects against the
   * manager it finds, and "absent" is a difference it can describe. Failing the
   * whole read would make an unrelated request unexecutable.
   */
  private async accountNameForDn(
    client: LdapClientLike,
    dn: string,
  ): Promise<string | undefined> {
    try {
      const entries = await client.search(dn, {
        scope: "base",
        filter: "(objectClass=*)",
        attributes: ["sAMAccountName"],
      });
      return firstString(entries[0]?.sAMAccountName) || undefined;
    } catch (error) {
      const classified = toAdError(error, "read", `membaca manager ${dn}`);
      if (classified.kind === "NOT_FOUND") return undefined;
      throw classified;
    }
  }

  private async requireManagerDn(client: LdapClientLike, accountName: string): Promise<string> {
    const entry = await this.findOne(
      client,
      accountNameFilter(accountName),
      `manager ${accountName}`,
    );
    if (!entry) {
      throw new AdError(
        "NOT_FOUND",
        `Manager ${accountName} tidak ada di direktori, jadi tidak ada yang bisa dijadikan atasan.`,
      );
    }
    return dnOf(entry);
  }

  private async changeGroups(
    objectGUID: string,
    groups: readonly string[],
    operation: "add" | "delete",
  ): Promise<void> {
    if (groups.length === 0) return;

    const what =
      operation === "add"
        ? `menambahkan group untuk ${objectGUID}`
        : `mencabut group dari ${objectGUID}`;

    this.assertWritable(what);
    this.assertCatalogueGroups(groups);

    await this.run(what, async ({ client, writing }) => {
      const entry = await this.requireEntry(client, objectGUID);
      const dn = dnOf(entry);
      this.assertManagedContainer(containerOf(dn), "Objek yang diubah keanggotaannya");

      const held = stringList(entry.memberOf);
      const isHeld = (group: string) => held.some((candidate) => dnEquals(candidate, group));
      const pending = groups.filter((group) => (operation === "add" ? !isHeld(group) : isHeld(group)));

      for (const group of pending) {
        writing();
        await client.modify(group, [{ operation, attribute: "member", values: [dn] }]);
      }
    });
  }

  private async setEnabled(objectGUID: string, enabled: boolean): Promise<void> {
    const what = enabled ? `mengaktifkan ${objectGUID}` : `menonaktifkan ${objectGUID}`;
    this.assertWritable(what);

    await this.run(what, async ({ client, writing }) => {
      const entry = await this.requireEntry(client, objectGUID);
      const dn = dnOf(entry);
      this.assertManagedContainer(containerOf(dn), "Objek yang diubah status aktifnya");

      const current = parseUserAccountControl(entry.userAccountControl);
      const next = withEnabled(current, enabled);
      if (next === current) return;

      writing();
      await client.modify(dn, [
        { operation: "replace", attribute: "userAccountControl", values: [String(next)] },
      ]);
    });
  }
}

function dnOf(entry: DirectoryEntry): string {
  const dn = firstString(entry.distinguishedName) || entry.dn;
  if (!dn) throw new AdError("UNKNOWN", "Objek direktori tidak menyertakan distinguishedName.");
  return dn;
}
