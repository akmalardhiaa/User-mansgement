import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeLdapDirectory } from "./fakeLdapDirectory";
import { LdapAdDriver } from "./ldapAd";
import type { LdapAdConfig } from "./ldapConnection";
import { MockAdDriver, seedMockDirectory } from "./mockAd";
import { AdError, type AdAccountState, type AdDriver } from "./types";

/**
 * One set of expectations, run against both drivers.
 *
 * The interface in types.ts was written for a real directory so that the mock
 * could not offer conveniences the real thing cannot. That is a claim, and a
 * claim about two implementations is only worth anything if the same test
 * proves it of both — so everything here is phrased in terms of `AdDriver` and
 * knows nothing about JSON files or LDAP.
 *
 * The behaviour each driver has on its own — how the simulated one injects
 * faults, how the real one escapes a filter or refuses an OU — is tested in
 * mockAd.test.ts and ldapAd.test.ts respectively. What lives here is the part
 * the worker depends on and must not differ.
 */

const KARYAWAN = "OU=Karyawan,DC=corp,DC=example,DC=com";
const ENGINEERING_OU = `OU=Engineering,${KARYAWAN}`;
const QUARANTINE = "OU=Karantina,DC=corp,DC=example,DC=com";
const GROUPS = "OU=Groups,DC=corp,DC=example,DC=com";

/** Catalogue groups. Anything outside the catalogue is refused by design. */
const BASE_GROUP = `CN=HC-Base,${GROUPS}`;
const ENGINEERING_GROUP = `CN=HC-Engineering,${GROUPS}`;

const MANAGER = "bagus.nugroho";

const SPEC = {
  sAMAccountName: "citra.wulandari",
  userPrincipalName: "citra.wulandari@corp.example.com",
  displayName: "Citra Wulandari",
  mail: "citra.wulandari@example.com",
  department: "IT — Engineering",
  title: "Backend Engineer",
  manager: MANAGER,
  ou: ENGINEERING_OU,
};

interface SeedAccount {
  sAMAccountName: string;
  displayName: string;
  mail: string;
  department?: string;
  title?: string;
  manager?: string;
  ou: string;
  enabled?: boolean;
  groups?: string[];
}

interface Harness {
  driver: AdDriver;
  /** Puts an account in the directory without going through the driver. */
  seed(account: SeedAccount): Promise<string>;
  setUp(): Promise<void>;
  tearDown(): Promise<void>;
}

function ldapConfig(): LdapAdConfig {
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
  };
}

function mockHarness(): Harness {
  let workspace: string;

  return {
    driver: new MockAdDriver(),
    async setUp() {
      workspace = await mkdtemp(path.join(tmpdir(), "hc-contract-mock-"));
      process.env.AD_MOCK_FILE = path.join(workspace, "mock-ad.json");
      await seedMockDirectory([]);
    },
    async tearDown() {
      delete process.env.AD_MOCK_FILE;
      await rm(workspace, { recursive: true, force: true });
    },
    async seed(account) {
      const existing = await readMock();
      const created: AdAccountState = {
        objectGUID: crypto.randomUUID(),
        sAMAccountName: account.sAMAccountName,
        userPrincipalName: `${account.sAMAccountName}@corp.example.com`,
        displayName: account.displayName,
        mail: account.mail,
        department: account.department ?? "",
        title: account.title ?? "",
        manager: account.manager,
        enabled: account.enabled ?? true,
        ou: account.ou,
        groups: [...(account.groups ?? [])].sort(),
      };
      await seedMockDirectory([...existing, created]);
      return created.objectGUID;
    },
  };
}

async function readMock(): Promise<AdAccountState[]> {
  const { readMockDirectory } = await import("./mockAd");
  return readMockDirectory();
}

function ldapHarness(): Harness {
  const directory = new FakeLdapDirectory();
  const driver = new LdapAdDriver(ldapConfig(), async () => directory.client());

  return {
    driver,
    async setUp() {
      for (const ou of [KARYAWAN, ENGINEERING_OU, QUARANTINE, GROUPS]) directory.addOu(ou);
      directory.addGroup(BASE_GROUP);
      directory.addGroup(ENGINEERING_GROUP);
      // The approving manager exists as an object, because the directory
      // stores `manager` as a DN and the driver has to resolve one.
      directory.addUser({
        dn: `CN=Bagus Nugroho,${KARYAWAN}`,
        sAMAccountName: MANAGER,
        displayName: "Bagus Nugroho",
        mail: "bagus.nugroho@example.com",
      });
    },
    async tearDown() {},
    async seed(account) {
      const guid = directory.addUser({
        dn: `CN=${account.displayName},${account.ou}`,
        sAMAccountName: account.sAMAccountName,
        displayName: account.displayName,
        mail: account.mail,
        department: account.department,
        title: account.title,
        managerDn: account.manager ? `CN=Bagus Nugroho,${KARYAWAN}` : undefined,
        userAccountControl: account.enabled === false ? 0x202 : 0x200,
      });
      for (const group of account.groups ?? []) {
        directory.addMember(group, `CN=${account.displayName},${account.ou}`);
      }
      return guid;
    },
  };
}

const HARNESSES: ReadonlyArray<[string, () => Harness]> = [
  ["mock", mockHarness],
  ["ldap", ldapHarness],
];

describe.each(HARNESSES)("AdDriver contract: %s", (_name, build) => {
  let harness: Harness;
  let driver: AdDriver;

  beforeEach(async () => {
    harness = build();
    driver = harness.driver;
    await harness.setUp();
  });

  afterEach(async () => {
    await harness.tearDown();
  });

  describe("creating an account", () => {
    it("creates it disabled, with no groups, in the OU it was given", async () => {
      const created = await driver.createAccount(SPEC);

      // An account that works before its access has been granted and verified
      // is a window nobody authorised.
      expect(created.enabled).toBe(false);
      expect(created.groups).toEqual([]);
      expect(created.ou).toBe(ENGINEERING_OU);
      expect(created.sAMAccountName).toBe(SPEC.sAMAccountName);
      expect(created.objectGUID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it("records the manager as an account name, not as anything else", async () => {
      const created = await driver.createAccount(SPEC);

      expect(created.manager).toBe(MANAGER);
      expect((await driver.findByGuid(created.objectGUID))?.manager).toBe(MANAGER);
    });

    it("refuses a second account with the same name", async () => {
      await driver.createAccount(SPEC);

      await expect(driver.createAccount(SPEC)).rejects.toMatchObject({ kind: "CONFLICT" });
    });
  });

  describe("finding an account", () => {
    it("finds it by account name and by GUID, and nothing by either otherwise", async () => {
      const guid = await harness.seed({
        sAMAccountName: "dewi.lestari",
        displayName: "Dewi Lestari",
        mail: "dewi.lestari@example.com",
        ou: KARYAWAN,
      });

      expect((await driver.findByAccountName("dewi.lestari"))?.objectGUID).toBe(guid);
      expect((await driver.findByGuid(guid))?.sAMAccountName).toBe("dewi.lestari");
      expect(await driver.findByAccountName("tidak.ada")).toBeUndefined();
      expect(await driver.findByGuid("00000000-0000-0000-0000-000000000000")).toBeUndefined();
    });
  });

  describe("changing attributes", () => {
    it("writes only what the patch names", async () => {
      const guid = await harness.seed({
        sAMAccountName: "dewi.lestari",
        displayName: "Dewi Lestari",
        mail: "dewi.lestari@example.com",
        department: "Legal",
        title: "Legal Counsel",
        ou: KARYAWAN,
      });

      await driver.setAttributes(guid, { department: "IT — Security", title: "Security Analyst" });

      const after = await driver.findByGuid(guid);
      expect(after?.department).toBe("IT — Security");
      expect(after?.title).toBe("Security Analyst");
      // Untouched, because the patch did not mention it.
      expect(after?.displayName).toBe("Dewi Lestari");
    });

    it("moves the manager by account name", async () => {
      const guid = await harness.seed({
        sAMAccountName: "dewi.lestari",
        displayName: "Dewi Lestari",
        mail: "dewi.lestari@example.com",
        ou: KARYAWAN,
      });

      await driver.setAttributes(guid, { manager: MANAGER });

      expect((await driver.findByGuid(guid))?.manager).toBe(MANAGER);
    });

    it("reports a missing object rather than writing nothing quietly", async () => {
      await expect(
        driver.setAttributes("00000000-0000-0000-0000-000000000000", { title: "X" }),
      ).rejects.toMatchObject({ kind: "NOT_FOUND" });
    });
  });

  describe("group membership", () => {
    it("grants, revokes, and reports the catalogue groups sorted", async () => {
      const guid = await harness.seed({
        sAMAccountName: "dewi.lestari",
        displayName: "Dewi Lestari",
        mail: "dewi.lestari@example.com",
        ou: KARYAWAN,
      });

      await driver.addGroups(guid, [ENGINEERING_GROUP, BASE_GROUP]);
      expect((await driver.findByGuid(guid))?.groups).toEqual([BASE_GROUP, ENGINEERING_GROUP]);

      await driver.removeGroups(guid, [ENGINEERING_GROUP]);
      expect((await driver.findByGuid(guid))?.groups).toEqual([BASE_GROUP]);
    });

    it("is idempotent in both directions, so a retry can re-run the step", async () => {
      const guid = await harness.seed({
        sAMAccountName: "dewi.lestari",
        displayName: "Dewi Lestari",
        mail: "dewi.lestari@example.com",
        ou: KARYAWAN,
        groups: [BASE_GROUP],
      });

      await driver.addGroups(guid, [BASE_GROUP]);
      expect((await driver.findByGuid(guid))?.groups).toEqual([BASE_GROUP]);

      await driver.removeGroups(guid, [ENGINEERING_GROUP]);
      expect((await driver.findByGuid(guid))?.groups).toEqual([BASE_GROUP]);
    });

    it("lists the members of a group", async () => {
      await harness.seed({
        sAMAccountName: "dewi.lestari",
        displayName: "Dewi Lestari",
        mail: "dewi.lestari@example.com",
        ou: KARYAWAN,
        groups: [BASE_GROUP],
      });

      const members = await driver.listGroupMembers(BASE_GROUP);

      expect(members.map((member) => member.sAMAccountName)).toEqual(["dewi.lestari"]);
      expect(members[0].mail).toBe("dewi.lestari@example.com");
    });
  });

  describe("moving and switching off", () => {
    it("moves the object to another OU without losing its groups", async () => {
      const guid = await harness.seed({
        sAMAccountName: "dewi.lestari",
        displayName: "Dewi Lestari",
        mail: "dewi.lestari@example.com",
        ou: KARYAWAN,
        groups: [BASE_GROUP],
      });

      await driver.moveToOu(guid, QUARANTINE);

      const after = await driver.findByGuid(guid);
      expect(after?.ou).toBe(QUARANTINE);
      expect(after?.groups).toEqual([BASE_GROUP]);
    });

    it("disables and re-enables the same object", async () => {
      const guid = await harness.seed({
        sAMAccountName: "dewi.lestari",
        displayName: "Dewi Lestari",
        mail: "dewi.lestari@example.com",
        ou: KARYAWAN,
      });

      await driver.disableAccount(guid);
      expect((await driver.findByGuid(guid))?.enabled).toBe(false);

      await driver.enableAccount(guid);
      expect((await driver.findByGuid(guid))?.enabled).toBe(true);
    });

    it("refuses to act on an object that is not there", async () => {
      const missing = "00000000-0000-0000-0000-000000000000";

      await expect(driver.disableAccount(missing)).rejects.toBeInstanceOf(AdError);
      await expect(driver.moveToOu(missing, QUARANTINE)).rejects.toMatchObject({
        kind: "NOT_FOUND",
      });
    });
  });
});
