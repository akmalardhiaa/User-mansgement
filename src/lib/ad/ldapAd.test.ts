import { beforeEach, describe, expect, it } from "vitest";

import { FakeLdapDirectory } from "./fakeLdapDirectory";
import { LdapAdDriver } from "./ldapAd";
import type { LdapAdConfig } from "./ldapConnection";
import { AdError } from "./types";

/**
 * What only the real driver has to get right.
 *
 * What the worker relies on from any driver lives in
 * adDriverContract.test.ts. This file is the other half: the guards, the
 * translations, and the refusals — the things that decide whether a bug here
 * is a failed request or a change nobody asked for in a production directory.
 */

const KARYAWAN = "OU=Karyawan,DC=corp,DC=example,DC=com";
const QUARANTINE = "OU=Karantina,DC=corp,DC=example,DC=com";
const GROUPS = "OU=Groups,DC=corp,DC=example,DC=com";
const BASE_GROUP = `CN=HC-Base,${GROUPS}`;
const ENGINEERING_GROUP = `CN=HC-Engineering,${GROUPS}`;

/** Outside the catalogue on purpose. This is the group nobody may be added to. */
const PRIVILEGED = "CN=Domain Admins,CN=Users,DC=corp,DC=example,DC=com";

const DONT_EXPIRE_PASSWORD = 0x10000;
const NORMAL_ACCOUNT = 0x200;
const ACCOUNTDISABLE = 0x2;

let directory: FakeLdapDirectory;

function config(overrides: Partial<LdapAdConfig> = {}): LdapAdConfig {
  return {
    url: "ldaps://dc.corp.example.com",
    baseDn: "DC=corp,DC=example,DC=com",
    bindDn: "CN=svc-hc,OU=Service,DC=corp,DC=example,DC=com",
    bindPassword: "unused-by-the-fake",
    caCertPath: "unused-by-the-fake",
    managedOus: [KARYAWAN, QUARANTINE],
    writeEnabled: true,
    nestedGroups: false,
    timeoutMs: 1000,
    pageSize: 50,
    ...overrides,
  };
}

function driverFor(overrides: Partial<LdapAdConfig> = {}): LdapAdDriver {
  return new LdapAdDriver(config(overrides), async () => directory.client());
}

function seedUser(options: {
  name: string;
  account: string;
  ou?: string;
  mail?: string;
  uac?: number;
  managerDn?: string;
  groups?: string[];
}): string {
  const dn = `CN=${options.name},${options.ou ?? KARYAWAN}`;
  const guid = directory.addUser({
    dn,
    sAMAccountName: options.account,
    displayName: options.name,
    mail: options.mail ?? `${options.account}@example.com`,
    department: "IT — Security",
    title: "Security Analyst",
    managerDn: options.managerDn,
    userAccountControl: options.uac ?? NORMAL_ACCOUNT,
  });
  for (const group of options.groups ?? []) directory.addMember(group, dn);
  return guid;
}

beforeEach(() => {
  directory = new FakeLdapDirectory();
  for (const ou of [KARYAWAN, QUARANTINE, GROUPS, "CN=Users,DC=corp,DC=example,DC=com"]) {
    directory.addOu(ou);
  }
  directory.addGroup(BASE_GROUP);
  directory.addGroup(ENGINEERING_GROUP);
  directory.addGroup(PRIVILEGED);
});

describe("with writing switched off", () => {
  const readOnly = () => driverFor({ writeEnabled: false });

  it("refuses every write, and writes nothing", async () => {
    const guid = seedUser({ name: "Dewi Lestari", account: "dewi.lestari" });
    const driver = readOnly();

    await expect(driver.setAttributes(guid, { title: "X" })).rejects.toMatchObject({
      kind: "PERMISSION",
    });
    await expect(driver.addGroups(guid, [BASE_GROUP])).rejects.toMatchObject({
      kind: "PERMISSION",
    });
    await expect(driver.moveToOu(guid, QUARANTINE)).rejects.toMatchObject({ kind: "PERMISSION" });
    await expect(driver.disableAccount(guid)).rejects.toMatchObject({ kind: "PERMISSION" });

    expect(directory.writes).toEqual([]);
  });

  it("says which switch is off", async () => {
    const guid = seedUser({ name: "Dewi Lestari", account: "dewi.lestari" });

    await expect(readOnly().disableAccount(guid)).rejects.toThrowError(/AD_LDAP_WRITE_ENABLED/);
  });

  it("keeps reading, because that is the point of the flag", async () => {
    const guid = seedUser({ name: "Dewi Lestari", account: "dewi.lestari" });

    expect((await readOnly().findByGuid(guid))?.sAMAccountName).toBe("dewi.lestari");
  });

  it("does not even open a connection to refuse", async () => {
    const guid = seedUser({ name: "Dewi Lestari", account: "dewi.lestari" });
    const before = directory.opened;

    await expect(readOnly().disableAccount(guid)).rejects.toBeInstanceOf(AdError);

    expect(directory.opened).toBe(before);
  });
});

describe("the managed OU boundary", () => {
  it("refuses an object that lives outside it", async () => {
    const guid = seedUser({
      name: "Administrator",
      account: "administrator",
      ou: "CN=Users,DC=corp,DC=example,DC=com",
    });

    await expect(driverFor().disableAccount(guid)).rejects.toMatchObject({ kind: "PERMISSION" });
    await expect(driverFor().setAttributes(guid, { title: "X" })).rejects.toMatchObject({
      kind: "PERMISSION",
    });
    expect(directory.writes).toEqual([]);
  });

  it("refuses a destination outside it", async () => {
    const guid = seedUser({ name: "Dewi Lestari", account: "dewi.lestari" });

    await expect(
      driverFor().moveToOu(guid, "OU=Elsewhere,DC=corp,DC=example,DC=com"),
    ).rejects.toMatchObject({ kind: "PERMISSION" });
    expect(directory.writes).toEqual([]);
  });

  it("refuses to create an account outside it", async () => {
    await expect(
      driverFor().createAccount({
        sAMAccountName: "x",
        userPrincipalName: "x@corp.example.com",
        displayName: "X",
        mail: "x@example.com",
        department: "",
        title: "",
        ou: "CN=Users,DC=corp,DC=example,DC=com",
      }),
    ).rejects.toMatchObject({ kind: "PERMISSION" });
    expect(directory.writes).toEqual([]);
  });

  it("names the OU and the allow-list in the message", async () => {
    const guid = seedUser({ name: "Dewi Lestari", account: "dewi.lestari" });

    await expect(
      driverFor().moveToOu(guid, "OU=Elsewhere,DC=corp,DC=example,DC=com"),
    ).rejects.toThrowError(/AD_MANAGED_OUS/);
  });
});

describe("group membership", () => {
  it("refuses a group the access catalogue does not publish", async () => {
    const guid = seedUser({ name: "Dewi Lestari", account: "dewi.lestari" });

    await expect(driverFor().addGroups(guid, [PRIVILEGED])).rejects.toMatchObject({
      kind: "PERMISSION",
    });
    expect(directory.writes).toEqual([]);
    expect(directory.groupsOf(`CN=Dewi Lestari,${KARYAWAN}`)).toEqual([]);
  });

  it("writes the membership on the group, where the directory keeps it", async () => {
    const guid = seedUser({ name: "Dewi Lestari", account: "dewi.lestari" });

    await driverFor().addGroups(guid, [BASE_GROUP]);

    expect(directory.entry(BASE_GROUP)?.attributes.member).toEqual([`CN=Dewi Lestari,${KARYAWAN}`]);
    expect(directory.writes).toEqual([`modify ${BASE_GROUP}`]);
  });

  it("sends nothing when the membership is already as asked", async () => {
    const guid = seedUser({
      name: "Dewi Lestari",
      account: "dewi.lestari",
      groups: [BASE_GROUP],
    });

    await driverFor().addGroups(guid, [BASE_GROUP]);
    await driverFor().removeGroups(guid, [ENGINEERING_GROUP]);

    expect(directory.writes).toEqual([]);
  });

  it("reports only the groups the catalogue issues", async () => {
    const guid = seedUser({
      name: "Dewi Lestari",
      account: "dewi.lestari",
      groups: [BASE_GROUP, PRIVILEGED],
    });

    // A membership somebody granted by hand is not this application's to
    // report — and reporting it would make a profile update's read-back
    // require it afterwards.
    expect((await driverFor().findByGuid(guid))?.groups).toEqual([BASE_GROUP]);
  });
});

describe("listing a group", () => {
  it("leaves out accounts that cannot answer", async () => {
    seedUser({ name: "Aktif", account: "aktif", groups: [BASE_GROUP] });
    seedUser({
      name: "Nonaktif",
      account: "nonaktif",
      uac: NORMAL_ACCOUNT | ACCOUNTDISABLE,
      groups: [BASE_GROUP],
    });
    seedUser({ name: "Tanpa Email", account: "tanpa.email", mail: "", groups: [BASE_GROUP] });

    const members = await driverFor().listGroupMembers(BASE_GROUP);

    expect(members.map((member) => member.sAMAccountName)).toEqual(["aktif"]);
  });

  it("reports a group DN nobody recognises as missing, not as empty", async () => {
    await expect(
      driverFor().listGroupMembers("CN=Salah Tulis,OU=Groups,DC=corp,DC=example,DC=com"),
    ).rejects.toMatchObject({ kind: "NOT_FOUND" });
  });

  it("ignores nesting by default and follows it when configured", async () => {
    // A group inside the approver group, with somebody inside that.
    const inner = `CN=HC-Engineering,${GROUPS}`;
    seedUser({ name: "Nested", account: "nested", groups: [inner] });
    directory.addMember(BASE_GROUP, inner);

    expect(await driverFor().listGroupMembers(BASE_GROUP)).toEqual([]);

    const nested = await driverFor({ nestedGroups: true }).listGroupMembers(BASE_GROUP);
    expect(nested.map((member) => member.sAMAccountName)).toEqual(["nested"]);
  });
});

describe("userAccountControl", () => {
  it("flips only the disable bit", async () => {
    const guid = seedUser({
      name: "Dewi Lestari",
      account: "dewi.lestari",
      uac: NORMAL_ACCOUNT | DONT_EXPIRE_PASSWORD,
    });

    await driverFor().disableAccount(guid);

    // Writing a flat 514 would have silently dropped DONT_EXPIRE_PASSWORD.
    const raw = Number(directory.value(`CN=Dewi Lestari,${KARYAWAN}`, "userAccountControl"));
    expect(raw).toBe(NORMAL_ACCOUNT | DONT_EXPIRE_PASSWORD | ACCOUNTDISABLE);
  });

  it("sends nothing when the account is already in the state asked for", async () => {
    const guid = seedUser({ name: "Dewi Lestari", account: "dewi.lestari" });

    await driverFor().enableAccount(guid);

    expect(directory.writes).toEqual([]);
  });

  it("creates a new account disabled and with no password material", async () => {
    await driverFor().createAccount({
      sAMAccountName: "citra.wulandari",
      userPrincipalName: "citra.wulandari@corp.example.com",
      displayName: "Citra Wulandari",
      mail: "citra.wulandari@example.com",
      department: "IT — Engineering",
      title: "Backend Engineer",
      ou: KARYAWAN,
    });

    const created = directory.entry(`CN=Citra Wulandari,${KARYAWAN}`);
    expect(created?.attributes.useraccountcontrol).toEqual([String(NORMAL_ACCOUNT | ACCOUNTDISABLE)]);
    expect(Object.keys(created?.attributes ?? {})).not.toContain("unicodepwd");
  });

  it("omits empty attributes rather than writing blank values", async () => {
    await driverFor().createAccount({
      sAMAccountName: "citra.wulandari",
      userPrincipalName: "citra.wulandari@corp.example.com",
      displayName: "Citra Wulandari",
      mail: "citra.wulandari@example.com",
      department: "",
      title: "",
      ou: KARYAWAN,
    });

    const created = directory.entry(`CN=Citra Wulandari,${KARYAWAN}`);
    expect(created?.attributes.department).toBeUndefined();
    expect(created?.attributes.title).toBeUndefined();
  });
});

describe("the manager attribute", () => {
  it("is stored as a DN and reported as an account name", async () => {
    const managerDn = `CN=Bagus Nugroho,${KARYAWAN}`;
    seedUser({ name: "Bagus Nugroho", account: "bagus.nugroho" });
    const guid = seedUser({ name: "Dewi Lestari", account: "dewi.lestari" });

    await driverFor().setAttributes(guid, { manager: "bagus.nugroho" });

    expect(directory.value(`CN=Dewi Lestari,${KARYAWAN}`, "manager")).toBe(managerDn);
    expect((await driverFor().findByGuid(guid))?.manager).toBe("bagus.nugroho");
  });

  it("refuses a manager who is not in the directory, before writing anything", async () => {
    const guid = seedUser({ name: "Dewi Lestari", account: "dewi.lestari" });

    await expect(
      driverFor().setAttributes(guid, { manager: "tidak.ada" }),
    ).rejects.toMatchObject({ kind: "NOT_FOUND" });
    expect(directory.writes).toEqual([]);
  });

  it("reports no manager when the manager object has since been deleted", async () => {
    const guid = seedUser({
      name: "Dewi Lestari",
      account: "dewi.lestari",
      managerDn: `CN=Sudah Dihapus,${KARYAWAN}`,
    });

    // An unrelated request must stay executable: "absent" is a difference the
    // worker can describe, a thrown read is not.
    expect((await driverFor().findByGuid(guid))?.manager).toBeUndefined();
  });
});

describe("reading", () => {
  it("refuses to choose between two objects with the same account name", async () => {
    seedUser({ name: "Dewi Lestari", account: "dewi.lestari" });
    seedUser({ name: "Dewi Lestari Kedua", account: "dewi.lestari", ou: QUARANTINE });

    await expect(driverFor().findByAccountName("dewi.lestari")).rejects.toMatchObject({
      kind: "CONFLICT",
    });
  });

  it("closes the connection it opened, on success and on failure", async () => {
    const guid = seedUser({ name: "Dewi Lestari", account: "dewi.lestari" });

    await driverFor().findByGuid(guid);
    await expect(driverFor().setAttributes(guid, { manager: "tidak.ada" })).rejects.toBeInstanceOf(
      AdError,
    );

    expect(directory.closed).toBe(directory.opened);
  });

  it("carries a directory result code through as a classified error", async () => {
    const guid = seedUser({ name: "Dewi Lestari", account: "dewi.lestari" });
    // The group is in the catalogue but not in the directory, so the write
    // reaches the server and comes back as noSuchObject (32).
    directory.remove(BASE_GROUP);

    await expect(driverFor().addGroups(guid, [BASE_GROUP])).rejects.toMatchObject({
      kind: "NOT_FOUND",
    });
  });
});

describe("clearing an attribute", () => {
  it("does not try to delete one that is already absent", async () => {
    const guid = directory.addUser({
      dn: `CN=Dewi Lestari,${KARYAWAN}`,
      sAMAccountName: "dewi.lestari",
      displayName: "Dewi Lestari",
      mail: "dewi.lestari@example.com",
    });

    // department was never set. A delete would be refused with noSuchAttribute.
    await driverFor().setAttributes(guid, { department: "" });

    expect(directory.writes).toEqual([]);
  });

  it("deletes one that is there", async () => {
    const guid = seedUser({ name: "Dewi Lestari", account: "dewi.lestari" });

    await driverFor().setAttributes(guid, { title: "" });

    expect(directory.value(`CN=Dewi Lestari,${KARYAWAN}`, "title")).toBeUndefined();
  });
});
