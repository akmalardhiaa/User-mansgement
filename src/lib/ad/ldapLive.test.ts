import { describe, expect, it } from "vitest";

import { LdapAdDriver } from "./ldapAd";
import { readLdapAdConfig, type LdapAdConfig } from "./ldapConnection";
import { AdError } from "./types";

/**
 * The driver against a real domain controller.
 *
 * Skipped unless `AD_LIVE_TEST=true`, because it needs a directory that the
 * service account may write in, and it leaves an account behind — it creates
 * one, moves it to quarantine and disables it, which is what a termination
 * does, and this driver has no delete operation on purpose.
 *
 * It exists because the unit tests and the contract tests prove the shape of
 * the operations and cannot prove the one thing only a directory knows: whether
 * what goes over the wire is what the server understands. Running this against
 * Samba AD DC is what found the bug it now guards — a binary objectGUID search
 * that the directory answers correctly and the client library silently mangles.
 *
 * To stand one up, see "Mencoba ke Active Directory sungguhan" in the README.
 *
 *   AD_LIVE_TEST=true \
 *   AD_LDAP_URL=ldaps://dc1.corp.example.com:636 \
 *   AD_BASE_DN=DC=corp,DC=example,DC=com \
 *   AD_BIND_DN="CN=Service Portal,OU=Karyawan,DC=corp,DC=example,DC=com" \
 *   AD_BIND_PASSWORD=… LDAP_CA_CERT_PATH=… AD_MANAGED_OUS=… \
 *   AD_LDAP_WRITE_ENABLED=true \
 *   npx vitest run src/lib/ad/ldapLive.test.ts
 */

const LIVE = process.env.AD_LIVE_TEST === "true";

/**
 * Who this run acts on and about.
 *
 * The manager and the group are read from the environment so the test is not
 * tied to one demo directory, and the new account gets a unique name so a
 * second run does not collide with the first one's leftovers.
 */
const MANAGER = process.env.AD_LIVE_MANAGER ?? "bagus.nugroho";
const GROUP = process.env.AD_LIVE_GROUP ?? "";
const SUFFIX = Math.random().toString(36).slice(2, 7);

describe.skipIf(!LIVE)("LdapAdDriver terhadap Active Directory sungguhan", () => {
  const config: LdapAdConfig | undefined = LIVE ? readLdapAdConfig(process.env) : undefined;
  const driver = config ? new LdapAdDriver(config) : undefined;

  // The two containers named in AD_MANAGED_OUS: the first is where accounts
  // live, the last is quarantine. Same convention the access catalogue uses.
  const managed = config?.managedOus ?? [];
  const homeOu = managed[0] ?? "";
  const quarantineOu = managed[managed.length - 1] ?? "";

  const spec = {
    sAMAccountName: `uji.live.${SUFFIX}`,
    userPrincipalName: `uji.live.${SUFFIX}@corp.example.com`,
    displayName: `Uji Live ${SUFFIX}`,
    mail: `uji.live.${SUFFIX}@example.com`,
    department: "IT — Engineering",
    title: "Backend Engineer",
    manager: MANAGER,
    ou: homeOu,
  };

  let guid = "";
  const groups: string[] = [];

  it("membaca akun yang sudah ada", async () => {
    const found = await driver!.findByAccountName(MANAGER);

    expect(found?.sAMAccountName).toBe(MANAGER);
    expect(found?.objectGUID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it.skipIf(!GROUP)("membaca anggota group", async () => {
    const members = await driver!.listGroupMembers(GROUP);

    // Everyone returned must be answerable: that is the filter this applies.
    expect(members.every((member) => member.enabled && member.mail)).toBe(true);
  });

  it("membuat akun dalam keadaan nonaktif", async () => {
    const created = await driver!.createAccount(spec);
    guid = created.objectGUID;

    expect(created.enabled).toBe(false);
    expect(created.ou).toBe(homeOu);
    expect(created.groups).toEqual([]);
    expect(created.manager).toBe(MANAGER);
  });

  it("membacanya kembali lewat objectGUID", async () => {
    // The step that only a real directory can prove: the GUID this application
    // stores has to be one the directory can be asked about again.
    const again = await driver!.findByGuid(guid);

    expect(again?.sAMAccountName).toBe(spec.sAMAccountName);
    expect(again?.department).toBe(spec.department);
  });

  it("memberi dan mencabut group, idempoten", async () => {
    const { accessProfileGroups } = await import("@/lib/lifecycle/accessProfiles");
    groups.push(...accessProfileGroups("standard"));
    if (groups.length === 0) return;

    await driver!.addGroups(guid, groups);
    await driver!.addGroups(guid, groups);
    expect((await driver!.findByGuid(guid))?.groups).toEqual([...groups].sort());

    await driver!.removeGroups(guid, groups);
    await driver!.removeGroups(guid, groups);
    expect((await driver!.findByGuid(guid))?.groups).toEqual([]);
  });

  it("mengubah atribut", async () => {
    await driver!.setAttributes(guid, { department: "IT — Security", title: "Security Analyst" });

    const after = await driver!.findByGuid(guid);
    expect(after?.department).toBe("IT — Security");
    expect(after?.title).toBe("Security Analyst");
  });

  it("mengaktifkan akun, atau melaporkan penolakan direktori apa adanya", async () => {
    /*
     * The password question, answered by whichever directory this runs against.
     *
     * This driver never writes password material, so a domain that requires a
     * password before an account may be enabled will refuse here. Both
     * outcomes are correct; what must never happen is an account that is
     * reported as live while the directory says otherwise.
     */
    try {
      await driver!.enableAccount(guid);
      expect((await driver!.findByGuid(guid))?.enabled).toBe(true);
    } catch (error) {
      expect(error).toBeInstanceOf(AdError);
      expect((await driver!.findByGuid(guid))?.enabled).toBe(false);
    }
  });

  it("memindahkan ke OU karantina lalu menonaktifkan", async () => {
    await driver!.moveToOu(guid, quarantineOu);
    await driver!.disableAccount(guid);

    const after = await driver!.findByGuid(guid);
    expect(after?.ou).toBe(quarantineOu);
    expect(after?.enabled).toBe(false);
  });

  it("menolak OU di luar AD_MANAGED_OUS tanpa menulis apa pun", async () => {
    await expect(driver!.moveToOu(guid, "CN=Users,DC=corp,DC=example,DC=com")).rejects.toMatchObject(
      { kind: "PERMISSION" },
    );
  });

  it("menolak group yang tidak diterbitkan katalog akses", async () => {
    await expect(
      driver!.addGroups(guid, ["CN=Domain Admins,CN=Users,DC=corp,DC=example,DC=com"]),
    ).rejects.toMatchObject({ kind: "PERMISSION" });
  });

  it("menolak semua tulis saat sakelar tulis dimatikan, dan tetap membaca", async () => {
    const readOnly = new LdapAdDriver({ ...config!, writeEnabled: false });

    await expect(readOnly.disableAccount(guid)).rejects.toMatchObject({ kind: "PERMISSION" });
    expect((await readOnly.findByGuid(guid))?.sAMAccountName).toBe(spec.sAMAccountName);
  });
});
