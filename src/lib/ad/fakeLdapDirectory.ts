import { randomUUID } from "node:crypto";

import type { LdapChange, LdapClientLike, LdapSearchOptions } from "./ldapConnection";
import { containerOf, isWithin, normaliseDn, rdnOf } from "./ldapDn";
import { guidToBytes } from "./ldapGuid";
import type { DirectoryEntry } from "./ldapEntry";

/**
 * A directory that behaves like one, for tests.
 *
 * TEST SUPPORT ONLY. Nothing in the application imports this file.
 *
 * The alternative — a mock client that returns canned entries for whatever
 * filter it is handed — would pass whatever the driver did, including sending a
 * filter that matches nothing, writing to the wrong object, or asking for
 * objectGUID as text. So this fake does the small number of things a real
 * server does that the driver depends on:
 *
 *   - It answers the filters the driver actually builds, by parsing them,
 *     including the escaped binary form of an objectGUID search.
 *   - `memberOf` is DERIVED from the `member` attribute of groups, the way AD
 *     derives it. A driver that wrote membership onto the user object instead
 *     of the group would therefore appear to do nothing.
 *   - `objectGUID` comes back as bytes only when it was requested as bytes.
 *   - `modifyDN` rewrites the DN and fixes up the group memberships pointing
 *     at it, so a moved account keeps its groups.
 *   - Failures carry numeric LDAP result codes, so the error mapping is
 *     exercised rather than described.
 *
 * What it is not is an LDAP server. The filter grammar covers AND, OR, NOT,
 * equality, presence and the one extensible match AD uses for nested groups;
 * anything else throws rather than silently matching nothing, because a filter
 * this cannot parse is a filter this cannot make claims about.
 */

/** LDAP result codes this fake raises. See ldapErrors.ts for the mapping. */
export const RESULT = {
  noSuchAttribute: 16,
  noSuchObject: 32,
  insufficientAccessRights: 50,
  unwillingToPerform: 53,
  entryAlreadyExists: 68,
  /** AD's catch-all refusal. ldapErrors.ts maps it to UNKNOWN: never retried. */
  other: 80,
} as const;

export class FakeLdapError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "FakeLdapError";
  }
}

interface FakeEntry {
  dn: string;
  /** Attribute name lower-cased; values always a list, as LDAP has no scalars. */
  attributes: Map<string, string[]>;
  guid: Buffer;
}

/* -------------------------------------------------------------------------- */
/* Filters                                                                    */
/* -------------------------------------------------------------------------- */

type Node =
  | { kind: "and" | "or"; children: Node[] }
  | { kind: "not"; child: Node }
  | { kind: "present"; attribute: string }
  | { kind: "equal"; attribute: string; value: Buffer; nested: boolean };

/** Turns `\5c` and friends back into the bytes they stand for. */
function unescapeAssertion(raw: string): Buffer {
  const bytes: number[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] === "\\" && index + 2 < raw.length) {
      bytes.push(Number.parseInt(raw.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }
    bytes.push(...Buffer.from(raw[index], "utf8"));
  }
  return Buffer.from(bytes);
}

function parseFilter(filter: string): Node {
  let at = 0;

  function fail(why: string): never {
    throw new FakeLdapError(80, `Filter tidak bisa dibaca fake directory (${why}): ${filter}`);
  }

  function parseNode(): Node {
    if (filter[at] !== "(") fail(`diharapkan "(" pada posisi ${at}`);
    at += 1;

    const operator = filter[at];
    if (operator === "&" || operator === "|") {
      at += 1;
      const children: Node[] = [];
      while (filter[at] === "(") children.push(parseNode());
      if (filter[at] !== ")") fail(`diharapkan ")" pada posisi ${at}`);
      at += 1;
      return { kind: operator === "&" ? "and" : "or", children };
    }

    if (operator === "!") {
      at += 1;
      const child = parseNode();
      if (filter[at] !== ")") fail(`diharapkan ")" pada posisi ${at}`);
      at += 1;
      return { kind: "not", child };
    }

    const close = filter.indexOf(")", at);
    if (close === -1) fail("tidak ada penutup");
    const clause = filter.slice(at, close);
    at = close + 1;

    const equals = clause.indexOf("=");
    if (equals === -1) fail(`klausa tanpa "=": ${clause}`);

    let attribute = clause.slice(0, equals);
    const raw = clause.slice(equals + 1);
    let nested = false;

    // (memberOf:1.2.840.113556.1.4.1941:=<dn>)
    const extensible = attribute.match(/^([^:]+):([\d.]+):$/);
    if (extensible) {
      if (extensible[2] !== "1.2.840.113556.1.4.1941") fail(`matching rule ${extensible[2]}`);
      attribute = extensible[1];
      nested = true;
    } else if (attribute.includes(":")) {
      fail(`atribut dengan modifier: ${attribute}`);
    }

    if (raw === "*") return { kind: "present", attribute: attribute.toLowerCase() };
    return { kind: "equal", attribute: attribute.toLowerCase(), value: unescapeAssertion(raw), nested };
  }

  const node = parseNode();
  if (at !== filter.length) fail(`sisa teks pada posisi ${at}`);
  return node;
}

/** Attributes whose values are DNs, and must be compared as DNs. */
const DN_VALUED = new Set(["member", "memberof", "manager", "distinguishedname"]);

/* -------------------------------------------------------------------------- */
/* The directory                                                              */
/* -------------------------------------------------------------------------- */

export class FakeLdapDirectory {
  private entries = new Map<string, FakeEntry>();

  /** Connections opened against this directory, for asserting one per operation. */
  opened = 0;
  closed = 0;
  /** Every write, in order, so a test can prove nothing was written. */
  readonly writes: string[] = [];

  /** Adds a container so `isWithin` has something to be inside of. */
  addOu(dn: string): void {
    this.put(dn, { objectclass: ["top", "organizationalUnit"] });
  }

  addGroup(dn: string, members: readonly string[] = []): void {
    this.put(dn, { objectclass: ["top", "group"], member: [...members] });
  }

  /** Appends a member, so seeding two people into one group keeps both. */
  addMember(groupDn: string, memberDn: string): void {
    const group = this.entries.get(normaliseDn(groupDn));
    if (!group) {
      this.addGroup(groupDn, [memberDn]);
      return;
    }
    group.attributes.set("member", [...(group.attributes.get("member") ?? []), memberDn]);
  }

  /** Deletes an object, for a test that needs the directory to say noSuchObject. */
  remove(dn: string): void {
    this.entries.delete(normaliseDn(dn));
  }

  addUser(options: {
    dn: string;
    sAMAccountName: string;
    displayName?: string;
    mail?: string;
    department?: string;
    title?: string;
    managerDn?: string;
    userAccountControl?: number;
    objectGUID?: string;
  }): string {
    const guid = options.objectGUID ?? randomUUID();
    this.put(
      options.dn,
      {
        objectclass: ["top", "person", "organizationalPerson", "user"],
        objectcategory: ["person"],
        samaccountname: [options.sAMAccountName],
        userprincipalname: [`${options.sAMAccountName}@corp.example.com`],
        displayname: [options.displayName ?? options.sAMAccountName],
        mail: options.mail ? [options.mail] : [],
        department: options.department ? [options.department] : [],
        title: options.title ? [options.title] : [],
        manager: options.managerDn ? [options.managerDn] : [],
        useraccountcontrol: [String(options.userAccountControl ?? 0x200)],
      },
      guid,
    );
    return guid;
  }

  private put(dn: string, attributes: Record<string, string[]>, guid: string = randomUUID()): void {
    const map = new Map<string, string[]>();
    for (const [name, values] of Object.entries(attributes)) {
      if (values.length > 0) map.set(name.toLowerCase(), [...values]);
    }
    this.entries.set(normaliseDn(dn), { dn, attributes: map, guid: guidToBytes(guid) });
  }

  /**
   * A new object's DN, spelled the way its parent is stored.
   *
   * AD does this: an account added under `ou=finance, OU=Karyawan` is reported
   * as being under `OU=Finance,OU=Karyawan`, because the parent already exists
   * and keeps its own spelling. A fake that echoed back whatever spelling it
   * was given would hide every comparison that treats DNs as plain strings.
   */
  private spelledAsParent(dn: string): string {
    const parent = this.entries.get(normaliseDn(containerOf(dn)));
    return parent ? `${rdnOf(dn)},${parent.dn}` : dn;
  }

  /** The stored entry, for assertions. */
  entry(dn: string): { dn: string; attributes: Record<string, string[]> } | undefined {
    const found = this.entries.get(normaliseDn(dn));
    if (!found) return undefined;
    return { dn: found.dn, attributes: Object.fromEntries(found.attributes) };
  }

  /** Whatever single value that attribute holds, for assertions. */
  value(dn: string, attribute: string): string | undefined {
    return this.entries.get(normaliseDn(dn))?.attributes.get(attribute.toLowerCase())?.[0];
  }

  /** The groups whose `member` list names this DN. */
  groupsOf(dn: string): string[] {
    const wanted = normaliseDn(dn);
    return [...this.entries.values()]
      .filter((candidate) =>
        (candidate.attributes.get("member") ?? []).some((member) => normaliseDn(member) === wanted),
      )
      .map((candidate) => candidate.dn)
      .sort();
  }

  /** Transitive memberOf, the way the nested matching rule resolves it. */
  private memberOf(dn: string, nested: boolean): string[] {
    const direct = this.groupsOf(dn);
    if (!nested) return direct;

    const seen = new Set(direct.map(normaliseDn));
    const queue = [...direct];
    while (queue.length > 0) {
      for (const parent of this.groupsOf(queue.shift()!)) {
        if (seen.has(normaliseDn(parent))) continue;
        seen.add(normaliseDn(parent));
        queue.push(parent);
      }
    }
    return [...this.entries.values()]
      .filter((candidate) => seen.has(normaliseDn(candidate.dn)))
      .map((candidate) => candidate.dn);
  }

  private valuesFor(entry: FakeEntry, attribute: string, nested: boolean): string[] {
    if (attribute === "distinguishedname") return [entry.dn];
    if (attribute === "memberof") return this.memberOf(entry.dn, nested);
    return entry.attributes.get(attribute) ?? [];
  }

  private matches(entry: FakeEntry, node: Node): boolean {
    switch (node.kind) {
      case "and":
        return node.children.every((child) => this.matches(entry, child));
      case "or":
        return node.children.some((child) => this.matches(entry, child));
      case "not":
        return !this.matches(entry, node.child);
      case "present":
        return this.valuesFor(entry, node.attribute, false).length > 0;
      case "equal": {
        if (node.attribute === "objectguid") return entry.guid.equals(node.value);
        const wanted = node.value.toString("utf8");
        const values = this.valuesFor(entry, node.attribute, node.nested);
        if (DN_VALUED.has(node.attribute)) {
          return values.some((value) => normaliseDn(value) === normaliseDn(wanted));
        }
        return values.some((value) => value.toLowerCase() === wanted.toLowerCase());
      }
    }
  }

  private project(entry: FakeEntry, options: LdapSearchOptions): DirectoryEntry {
    const binary = new Set((options.binaryAttributes ?? []).map((name) => name.toLowerCase()));
    const projected: DirectoryEntry = { dn: entry.dn };

    for (const requested of options.attributes) {
      const key = requested.toLowerCase();
      if (key === "objectguid") {
        // Requested as text, returned as text — and a driver that then tries to
        // decode it as bytes finds out here rather than in production.
        projected[requested] = binary.has(key) ? entry.guid : entry.guid.toString("latin1");
        continue;
      }
      const values = this.valuesFor(entry, key, false);
      if (values.length === 0) continue;
      projected[requested] = values.length === 1 ? values[0] : values;
    }
    return projected;
  }

  /**
   * An object by DN — including Active Directory's `<GUID=...>` extended form,
   * which is how the driver reads one object by its GUID.
   */
  private require(dn: string): FakeEntry {
    const extended = /^<GUID=([0-9a-f-]{36})>$/i.exec(dn.trim());
    if (extended) {
      const wanted = guidToBytes(extended[1]);
      const found = [...this.entries.values()].find((entry) => entry.guid.equals(wanted));
      if (!found) throw new FakeLdapError(RESULT.noSuchObject, `Objek ${dn} tidak ada.`);
      return found;
    }

    const entry = this.entries.get(normaliseDn(dn));
    if (!entry) throw new FakeLdapError(RESULT.noSuchObject, `Objek ${dn} tidak ada.`);
    return entry;
  }

  /** A client bound to this this. */
  client(): LdapClientLike {
    this.opened += 1;

    // Arrow functions throughout, so the methods close over this directory
    // without aliasing `this` into a local.
    return {
      search: async (baseDn: string, options: LdapSearchOptions): Promise<DirectoryEntry[]> => {
        const node = parseFilter(options.filter);
        const base = normaliseDn(baseDn);

        if (options.scope === "base") {
          const entry = this.require(baseDn);
          return this.matches(entry, node) ? [this.project(entry, options)] : [];
        }

        return [...this.entries.values()]
          .filter((entry) => {
            const dn = normaliseDn(entry.dn);
            if (options.scope === "one") return normaliseDn(containerOf(entry.dn)) === base;
            return dn === base || isWithin(entry.dn, baseDn);
          })
          .filter((entry) => this.matches(entry, node))
          .map((entry) => this.project(entry, options));
      },

      add: async (dn: string, attributes: Record<string, string | string[]>): Promise<void> => {
        this.writes.push(`add ${dn}`);
        if (this.entries.has(normaliseDn(dn))) {
          throw new FakeLdapError(RESULT.entryAlreadyExists, `Objek ${dn} sudah ada.`);
        }
        const normalised: Record<string, string[]> = {};
        for (const [name, value] of Object.entries(attributes)) {
          normalised[name] = Array.isArray(value) ? value : [value];
        }
        /*
         * objectCategory is derived, not supplied.
         *
         * The schema sets it from the object class, which is why every AD
         * filter written by hand pairs `objectCategory=person` with
         * `objectClass=user` and no caller ever writes the former. A fake that
         * required it would have made the driver write an attribute a real
         * directory refuses.
         */
        if (!normalised.objectCategory && normalised.objectClass?.includes("user")) {
          normalised.objectCategory = ["person"];
        }
        // A new object gets its GUID from the directory, as it would in AD.
        this.put(this.spelledAsParent(dn), normalised);
      },

      modify: async (dn: string, changes: readonly LdapChange[]): Promise<void> => {
        this.writes.push(`modify ${dn}`);
        const entry = this.require(dn);

        for (const change of changes) {
          const key = change.attribute.toLowerCase();
          const current = entry.attributes.get(key) ?? [];

          if (change.operation === "replace") {
            entry.attributes.set(key, [...change.values]);
            continue;
          }
          if (change.operation === "add") {
            entry.attributes.set(key, [...current, ...change.values]);
            continue;
          }
          // delete
          if (change.values.length === 0) {
            if (current.length === 0) {
              throw new FakeLdapError(RESULT.noSuchAttribute, `${change.attribute} tidak ada di ${dn}.`);
            }
            entry.attributes.delete(key);
            continue;
          }
          const remaining = current.filter(
            (value) => !change.values.some((target) => normaliseDn(target) === normaliseDn(value)),
          );
          if (remaining.length === current.length) {
            throw new FakeLdapError(
              RESULT.noSuchAttribute,
              `Nilai yang dihapus tidak ada di ${change.attribute} pada ${dn}.`,
            );
          }
          entry.attributes.set(key, remaining);
        }
      },

      modifyDn: async (dn: string, newDn: string): Promise<void> => {
        this.writes.push(`modifyDn ${dn} -> ${newDn}`);
        const entry = this.require(dn);
        if (this.entries.has(normaliseDn(newDn))) {
          throw new FakeLdapError(RESULT.entryAlreadyExists, `Objek ${newDn} sudah ada.`);
        }

        this.entries.delete(normaliseDn(dn));
        entry.dn = this.spelledAsParent(newDn);
        this.entries.set(normaliseDn(newDn), entry);

        // AD keeps referential integrity for group membership across a move.
        for (const candidate of this.entries.values()) {
          const members = candidate.attributes.get("member");
          if (!members) continue;
          candidate.attributes.set(
            "member",
            members.map((member) => (normaliseDn(member) === normaliseDn(dn) ? entry.dn : member)),
          );
        }
      },

      close: async (): Promise<void> => {
        this.closed += 1;
      },
    };
  }
}
