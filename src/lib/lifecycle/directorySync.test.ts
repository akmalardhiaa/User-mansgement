import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAdDriver } from "@/lib/ad";
import { installTestDirectory, type TestAccount, type TestDirectory } from "@/lib/ad/testDirectory";
import type { StoreShape } from "@/lib/db/store";
import type { Employee } from "@/lib/types";

import { directorySyncSources, syncEmployeesFromDirectory } from "./directorySync";

/**
 * People in Active Directory appear in the portal's directory on their own.
 *
 * Run through the real LDAP driver over a fake directory, so the read is the
 * one production makes.
 */

const BASE = "DC=corp,DC=example,DC=com";
const KARYAWAN = `OU=Karyawan,${BASE}`;
const ENV = { AD_BASE_DN: BASE };

let workspace: string;
let storePath: string;
let dir: TestDirectory;

function person(overrides: Partial<TestAccount> & Pick<TestAccount, "sAMAccountName" | "displayName">): TestAccount {
  return {
    mail: `${overrides.sAMAccountName}@kantor.co.id`,
    ou: KARYAWAN,
    department: "Finance",
    title: "Analyst",
    ...overrides,
  };
}

async function seed(employees: Partial<Employee>[] = []): Promise<void> {
  const store = {
    employees,
    requests: [],
    activity: [],
    lifecycleRequests: [],
    executionJobs: [],
    outboxEvents: [],
    emailDeliveries: [],
    approvalTokens: [],
    auditEvents: [],
  };
  await writeFile(storePath, JSON.stringify(store), "utf8");
}

async function store(): Promise<StoreShape> {
  return JSON.parse(await readFile(storePath, "utf8")) as StoreShape;
}

async function employee(email: string): Promise<Employee | undefined> {
  return (await store()).employees.find((candidate) => candidate.email === email);
}

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "hc-sync-"));
  storePath = path.join(workspace, "store.json");
  vi.stubEnv("HC_DATA_FILE", storePath);
  resetAdDriver();
  dir = installTestDirectory();
  dir.addManager("sarah.wijaya", "Sarah Wijaya");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  resetAdDriver();
  await rm(workspace, { recursive: true, force: true });
});

describe("the first sync", () => {
  it("brings in every enabled person with a mailbox, with their manager", async () => {
    await seed();
    dir.addAccount(person({ sAMAccountName: "dewi.lestari", displayName: "Dewi Lestari", givenName: "Dewi", sn: "Lestari", manager: "sarah.wijaya" }));
    dir.addAccount(person({ sAMAccountName: "svc-backup", displayName: "Backup Service", mail: "" }));
    dir.addAccount(person({ sAMAccountName: "lama.keluar", displayName: "Lama Keluar", enabled: false }));

    const report = await syncEmployeesFromDirectory({ env: ENV });

    // Sarah is a manager in the Pimpinan OU - inside the base DN, so she is
    // read too: a manager the portal cannot see is one nobody can choose.
    expect(report).toMatchObject({ created: 2, skipped: 1, ignoredDisabled: 1 });
    const dewi = await employee("dewi.lestari@kantor.co.id");
    expect(dewi).toMatchObject({
      firstName: "Dewi",
      lastName: "Lestari",
      displayName: "Dewi Lestari",
      department: "Finance",
      jobTitle: "Analyst",
      managerName: "Sarah Wijaya",
      managerEmail: "sarah.wijaya@example.com",
      status: "ACTIVE",
    });
    expect(dewi?.objectGUID).toMatch(/^[0-9a-f-]{36}$/);
    expect((await store()).employees.some((candidate) => candidate.email.startsWith("svc-backup"))).toBe(false);
    expect((await store()).activity[0]).toMatchObject({ action: "directory.synced", actor: "Sinkronisasi AD" });
  });

  it("splits the display name when the directory holds no given name or surname", async () => {
    await seed();
    dir.addAccount(person({ sAMAccountName: "budi.santoso", displayName: "Budi Santoso Putra" }));

    await syncEmployeesFromDirectory({ env: ENV });

    expect(await employee("budi.santoso@kantor.co.id")).toMatchObject({ firstName: "Budi", lastName: "Santoso Putra" });
  });
});

describe("later syncs", () => {
  it("change nothing, and record nothing, when nothing changed", async () => {
    await seed();
    dir.addAccount(person({ sAMAccountName: "dewi.lestari", displayName: "Dewi Lestari" }));
    await syncEmployeesFromDirectory({ env: ENV });
    const activityBefore = (await store()).activity.length;

    const second = await syncEmployeesFromDirectory({ env: ENV });

    expect(second).toMatchObject({ created: 0, updated: 0, linked: 0 });
    expect((await store()).activity).toHaveLength(activityBefore);
    expect((await store()).employees.filter((candidate) => candidate.email === "dewi.lestari@kantor.co.id")).toHaveLength(1);
  });

  it("follow a change made in Active Directory, including being switched off", async () => {
    await seed();
    const guid = dir.addAccount(person({ sAMAccountName: "dewi.lestari", displayName: "Dewi Lestari" }));
    await syncEmployeesFromDirectory({ env: ENV });

    await dir.driver.setAttributes(guid, { department: "Treasury" });
    await dir.driver.disableAccount(guid);
    const report = await syncEmployeesFromDirectory({ env: ENV });

    expect(report.updated).toBe(1);
    expect(await employee("dewi.lestari@kantor.co.id")).toMatchObject({ department: "Treasury", status: "DISABLED" });
  });
});

describe("records the portal already had", () => {
  it("links one by address and keeps what only the portal knows", async () => {
    await seed([
      {
        id: "emp_lama",
        firstName: "Dewi",
        lastName: "L",
        displayName: "Dewi L",
        email: "Dewi.Lestari@kantor.co.id",
        jobTitle: "Analyst",
        department: "Finance",
        managerName: "",
        managerEmail: "",
        employmentType: "CONTRACT",
        expiredDate: "2027-03-31",
        locationType: "CABANG",
        branchName: "Surabaya",
        status: "ACTIVE",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const guid = dir.addAccount(person({ sAMAccountName: "dewi.lestari", displayName: "Dewi Lestari" }));

    const report = await syncEmployeesFromDirectory({ env: { ...ENV, AD_SYNC_OUS: KARYAWAN } });

    expect(report).toMatchObject({ created: 0, linked: 1 });
    const [record] = (await store()).employees;
    expect(record).toMatchObject({
      id: "emp_lama",
      objectGUID: guid,
      displayName: "Dewi Lestari",
      employmentType: "CONTRACT",
      expiredDate: "2027-03-31",
      locationType: "CABANG",
      branchName: "Surabaya",
    });
  });

  it("never blanks a value the directory leaves empty", async () => {
    await seed([
      {
        id: "emp_lama",
        firstName: "Dewi",
        lastName: "Lestari",
        displayName: "Dewi Lestari",
        email: "dewi.lestari@kantor.co.id",
        jobTitle: "Senior Analyst",
        department: "Finance",
        managerName: "",
        managerEmail: "",
        status: "ACTIVE",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    dir.addAccount(person({ sAMAccountName: "dewi.lestari", displayName: "Dewi Lestari", title: "" }));

    await syncEmployeesFromDirectory({ env: ENV });

    expect((await employee("dewi.lestari@kantor.co.id"))?.jobTitle).toBe("Senior Analyst");
  });

  it("leaves alone, and counts, a linked record the read did not return", async () => {
    await seed([
      {
        id: "emp_hilang",
        firstName: "Hilang",
        lastName: "Orang",
        displayName: "Hilang Orang",
        email: "hilang@kantor.co.id",
        jobTitle: "Analyst",
        department: "Finance",
        managerName: "",
        managerEmail: "",
        status: "ACTIVE",
        objectGUID: "11111111-2222-4333-8444-555555555555",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const report = await syncEmployeesFromDirectory({ env: ENV });

    expect(report.notFound).toBe(1);
    expect(await employee("hilang@kantor.co.id")).toMatchObject({ status: "ACTIVE" });
  });

  it("does not merge two people who share an address", async () => {
    await seed([
      {
        id: "emp_lain",
        firstName: "Orang",
        lastName: "Lain",
        displayName: "Orang Lain",
        email: "dewi.lestari@kantor.co.id",
        jobTitle: "Analyst",
        department: "Finance",
        managerName: "",
        managerEmail: "",
        status: "ACTIVE",
        objectGUID: "11111111-2222-4333-8444-555555555555",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    dir.addAccount(person({ sAMAccountName: "dewi.lestari", displayName: "Dewi Lestari" }));

    const report = await syncEmployeesFromDirectory({ env: { ...ENV, AD_SYNC_OUS: KARYAWAN } });

    expect(report).toMatchObject({ conflicts: 1, created: 0 });
    expect((await store()).employees).toHaveLength(1);
  });
});

describe("where it reads from", () => {
  it("is the base DN unless AD_SYNC_OUS narrows it", () => {
    expect(directorySyncSources({ AD_BASE_DN: BASE })).toEqual([BASE]);
    expect(directorySyncSources({ AD_BASE_DN: BASE, AD_SYNC_OUS: `${KARYAWAN}; OU=Lain,${BASE}` })).toEqual([
      KARYAWAN,
      `OU=Lain,${BASE}`,
    ]);
  });

  it("still finds a manager who sits outside a narrowed scope", async () => {
    await seed();
    dir.addAccount(person({ sAMAccountName: "dewi.lestari", displayName: "Dewi Lestari", manager: "sarah.wijaya" }));

    const report = await syncEmployeesFromDirectory({ env: { ...ENV, AD_SYNC_OUS: KARYAWAN } });

    // Sarah is in the Pimpinan OU, outside the scope, so she is not brought in
    // - but Dewi's manager is still known.
    expect(report.created).toBe(1);
    expect(await employee("dewi.lestari@kantor.co.id")).toMatchObject({
      managerName: "Sarah Wijaya",
      managerEmail: "sarah.wijaya@example.com",
    });
  });
});
