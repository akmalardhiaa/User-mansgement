import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The first run on a machine that has just cloned this.
 *
 * The roster seeds itself; the simulated directory used not to, and a Movement
 * for one of those employees then failed on an account nobody had created.
 *
 * Each test imports the module fresh. The AD driver is cached per module
 * instance, so a test that switches AD_DRIVER would otherwise be answered by
 * whichever driver the previous test built.
 */

let workspace: string;
let adFile: string;
let storeFile: string;

async function bootstrap() {
  vi.resetModules();
  const { seedMockAdOnFirstRun } = await import("./bootstrapMockAd");
  await seedMockAdOnFirstRun();
}

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "hc-bootstrap-"));
  adFile = path.join(workspace, "mock-ad.json");
  storeFile = path.join(workspace, "hc-store.json");
  vi.stubEnv("HC_DATA_FILE", storeFile);
  vi.stubEnv("AD_MOCK_FILE", adFile);
  vi.stubEnv("AD_DRIVER", "mock");
  vi.stubEnv("NODE_ENV", "development");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  await rm(workspace, { recursive: true, force: true });
});

const accounts = async () =>
  (JSON.parse(await readFile(adFile, "utf8")) as { accounts: Array<Record<string, unknown>> })
    .accounts;

describe("filling the simulated directory on a first run", () => {
  it("gives every seeded employee an account, linked by objectGUID", async () => {
    await bootstrap();

    const created = await accounts();
    const store = JSON.parse(await readFile(storeFile, "utf8")) as {
      employees: Array<{ objectGUID?: string; status: string }>;
    };

    expect(created.length).toBe(store.employees.length);
    // The link is the point: execution keys on objectGUID, and accounts created
    // without recording it leave the same failure in place.
    expect(store.employees.every((employee) => Boolean(employee.objectGUID))).toBe(true);

    // Each account mirrors what the roster says today, rather than all being
    // switched on: a disabled employee with a working account is a wrong fixture.
    const enabled = created.filter((account) => account.enabled === true).length;
    const active = store.employees.filter((employee) => employee.status === "ACTIVE").length;
    expect(enabled).toBe(active);
    expect(active).toBeGreaterThan(0);
  });

  it("grants Human Capital the one group that opens the portal", async () => {
    vi.stubEnv("AD_GROUP_HC", "CN=HC-Portal-Users,OU=Groups,DC=corp,DC=example,DC=com");

    await bootstrap();

    const store = JSON.parse(await readFile(storeFile, "utf8")) as {
      employees: Array<{ department: string; objectGUID?: string }>;
    };
    const created = await accounts();
    const groupsOf = (guid?: string) =>
      (created.find((account) => account.objectGUID === guid)?.groups ?? []) as string[];

    const hc = store.employees.filter((employee) => employee.department === "Human Capital");
    expect(hc.length).toBeGreaterThan(0);
    for (const employee of hc) {
      expect(groupsOf(employee.objectGUID)).toContain(
        "CN=HC-Portal-Users,OU=Groups,DC=corp,DC=example,DC=com",
      );
    }

    // Nobody else. The group is portal authority, not an access profile.
    for (const employee of store.employees.filter((e) => e.department !== "Human Capital")) {
      expect(groupsOf(employee.objectGUID)).not.toContain(
        "CN=HC-Portal-Users,OU=Groups,DC=corp,DC=example,DC=com",
      );
    }
  });

  it("grants nothing when no HC group is configured", async () => {
    vi.stubEnv("AD_GROUP_HC", "");

    await bootstrap();

    // A DN invented here would map to no role, so inventing one is worse than
    // granting nothing.
    const created = await accounts();
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((account) => ((account.groups ?? []) as string[]).every((g) => !/Portal/i.test(g)))).toBe(true);
  });

  it("leaves an existing directory alone, empty or not", async () => {
    // Somebody's demo state: a directory deliberately emptied to show what a
    // missing account does. Restoring it behind their back is its own surprise.
    await writeFile(adFile, JSON.stringify({ accounts: [] }), "utf8");

    await bootstrap();

    expect(await accounts()).toEqual([]);
  });

  it("does nothing at all, and says nothing, when the directory is not simulated", async () => {
    vi.stubEnv("AD_DRIVER", "ldap");
    vi.stubEnv("LDAP_URL", "ldaps://dc.corp.example.com");
    vi.stubEnv("LDAP_BIND_DN", "CN=svc,DC=corp,DC=example,DC=com");
    vi.stubEnv("LDAP_BIND_PASSWORD", "not-used-here");
    vi.stubEnv("LDAP_BASE_DN", "DC=corp,DC=example,DC=com");

    // Returns quietly rather than throwing at startup: whatever is wrong with
    // the AD configuration is the business of the first request that needs it.
    await expect(bootstrap()).resolves.toBeUndefined();

    // No simulated file written, and above all no accounts manufactured in the
    // directory that would have been the real one.
    await expect(readFile(adFile, "utf8")).rejects.toThrow();
  });
});
