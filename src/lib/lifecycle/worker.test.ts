import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAdDriver } from "@/lib/ad";
import { readMockDirectory } from "@/lib/ad/mockAd";
import type { AdAccountState } from "@/lib/ad/types";
import type { StoreShape } from "@/lib/db/store";

import { accessProfileGroups, accessProfileOu } from "./accessProfiles";
import { hashPayload } from "./payload";
import { runDueJobs } from "./worker";
import type { LifecyclePayload, LifecycleRequest, LifecycleStatus } from "./types";

/**
 * The worker's failure paths, which are the ones that matter.
 *
 * "It works when nothing goes wrong" is the least interesting property an
 * execution engine has. What these check is that an interrupted job leaves the
 * account in a safe state, that a retry resumes instead of re-applying, and
 * that nothing is reported as done without the directory having been asked.
 */

let workspace: string;
let storePath: string;

const ONBOARDING: LifecyclePayload = {
  kind: "ONBOARDING",
  nik: "2026001",
  firstName: "Citra",
  lastName: "Wulandari",
  displayName: "Citra Wulandari",
  email: "citra.wulandari@example.com",
  jobTitle: "Backend Engineer",
  department: "IT — Engineering",
  employmentType: "PERMANENT",
  locationType: "PUSAT",
  managerName: "Sarah Wijaya",
  managerEmail: "sarah.wijaya@example.com",
  startDate: "2026-10-01",
  accessProfileId: "engineering",
};

function request(
  overrides: Partial<LifecycleRequest> & { payload: LifecyclePayload },
): LifecycleRequest {
  // `payload` is pulled out of the overrides rather than spread twice: the hash
  // has to be taken from the payload that actually ends up on the request.
  const { payload, ...rest } = overrides;
  return {
    id: "lr_test",
    type: payload.kind,
    version: 1,
    status: "QUEUED" as LifecycleStatus,
    requester: { name: "Ayu Prameswari", email: "ayu@example.com", userId: "ayu" },
    subject: { displayName: "Subjek" },
    payload,
    payloadHash: hashPayload(payload),
    approvals: [],
    policyVersion: "2026-09-16.1",
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
    ...rest,
  };
}

function employee(overrides: Partial<StoreShape["employees"][number]> = {}) {
  return {
    id: "emp_1",
    firstName: "Rizky",
    lastName: "Maulana",
    displayName: "Rizky Maulana",
    email: "rizky.maulana@example.com",
    jobTitle: "Senior Backend Engineer",
    department: "IT — Engineering",
    managerName: "Sarah Wijaya",
    managerEmail: "sarah.wijaya@example.com",
    status: "ACTIVE" as const,
    createdAt: "2026-01-06T09:00:00.000Z",
    updatedAt: "2026-01-06T09:00:00.000Z",
    ...overrides,
  };
}

function adAccount(overrides: Partial<AdAccountState> = {}): AdAccountState {
  return {
    objectGUID: "guid-rizky",
    sAMAccountName: "rizky.maulana",
    userPrincipalName: "rizky.maulana@example.com",
    displayName: "Rizky Maulana",
    mail: "rizky.maulana@example.com",
    department: "IT — Engineering",
    title: "Senior Backend Engineer",
    manager: "sarah.wijaya",
    enabled: true,
    ou: accessProfileOu("engineering"),
    groups: accessProfileGroups("engineering"),
    ...overrides,
  };
}

async function seed(store: Partial<StoreShape>, ad: AdAccountState[] = []): Promise<void> {
  const full: StoreShape = {
    employees: [],
    requests: [],
    activity: [],
    lifecycleRequests: [],
    executionJobs: [],
    outboxEvents: [],
    emailDeliveries: [],
    approvalTokens: [],
    auditEvents: [],
    ...store,
  };
  await writeFile(storePath, JSON.stringify(full, null, 2), "utf8");
  await writeFile(path.join(workspace, "mock-ad.json"), JSON.stringify({ accounts: ad }, null, 2), "utf8");
}

async function store(): Promise<StoreShape> {
  return JSON.parse(await readFile(storePath, "utf8")) as StoreShape;
}

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "hc-worker-"));
  storePath = path.join(workspace, "store.json");
  vi.stubEnv("HC_DATA_FILE", storePath);
  vi.stubEnv("AD_MOCK_FILE", path.join(workspace, "mock-ad.json"));
  vi.stubEnv("AD_DRIVER", "mock");
  vi.stubEnv("AD_MOCK_FAULT", "none");
  resetAdDriver();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  resetAdDriver();
  await rm(workspace, { recursive: true, force: true });
});

describe("onboarding, start to finish", () => {
  it("creates the account, enables it, and records the employee only after reading back", async () => {
    await seed({ lifecycleRequests: [request({ payload: ONBOARDING })] });

    const report = await runDueJobs({ workerId: "w1" });
    expect(report.completed).toBe(1);

    const after = await store();
    expect(after.lifecycleRequests[0].status).toBe("COMPLETED");

    // The employee record appears only now — not when the request was approved.
    const created = after.employees.find((e) => e.email === ONBOARDING.email);
    expect(created?.status).toBe("ACTIVE");
    expect(created?.objectGUID).toBeTruthy();

    const [account] = await readMockDirectory();
    expect(account.enabled).toBe(true);
    expect(account.groups).toEqual(accessProfileGroups("engineering"));
  });
});

describe("a job that fails part-way", () => {
  it("leaves the account disabled and creates no employee record", async () => {
    // Groups fail after the account has been created.
    vi.stubEnv("AD_MOCK_FAULT", "partial-groups");
    resetAdDriver();
    await seed({ lifecycleRequests: [request({ payload: ONBOARDING })] });

    const report = await runDueJobs({ workerId: "w1" });
    expect(report.failed).toBe(1);

    const after = await store();
    expect(after.lifecycleRequests[0].status).toBe("FAILED");
    // Nothing may claim this person exists in the directory of record.
    expect(after.employees).toHaveLength(0);

    const [account] = await readMockDirectory();
    // The account exists but cannot be used, which is the safe half-state.
    expect(account.enabled).toBe(false);
    expect(account.groups).toEqual([]);
  });

  it("resumes from the checkpoint instead of creating a second account", async () => {
    vi.stubEnv("AD_MOCK_FAULT", "partial-groups");
    resetAdDriver();
    await seed({ lifecycleRequests: [request({ payload: ONBOARDING })] });
    await runDueJobs({ workerId: "w1" });

    // The outage clears. A retry must not re-run create-account: doing so would
    // either make a second account or fail on CONFLICT.
    vi.stubEnv("AD_MOCK_FAULT", "none");
    resetAdDriver();
    const after = await store();
    after.lifecycleRequests[0].status = "QUEUED";
    await writeFile(storePath, JSON.stringify(after, null, 2), "utf8");

    const second = await runDueJobs({ workerId: "w1" });
    expect(second.completed).toBe(1);

    expect(await readMockDirectory()).toHaveLength(1);
    const final = await store();
    expect(final.lifecycleRequests[0].status).toBe("COMPLETED");
    expect(final.executionJobs[0].attempt).toBe(2);
  });
});

describe("a permission failure", () => {
  it("fails without retrying, and writes nothing", async () => {
    vi.stubEnv("AD_MOCK_FAULT", "permission");
    resetAdDriver();
    await seed({ lifecycleRequests: [request({ payload: ONBOARDING })] });

    const report = await runDueJobs({ workerId: "w1" });

    expect(report.outcomes[0].errorCode).toBe("AD_PERMISSION");
    expect(await readMockDirectory()).toHaveLength(0);
    expect((await store()).employees).toHaveLength(0);
  });
});

describe("drift", () => {
  it("refuses to execute when the account changed since approval", async () => {
    const movement: LifecyclePayload = {
      kind: "MOVEMENT",
      employeeId: "emp_1",
      toDepartment: "IT — Security",
      toJobTitle: "Security Engineer",
      toManagerName: "Bagus Nugroho",
      toManagerEmail: "bagus.nugroho@example.com",
      accessProfileId: "security",
      reason: "Rotasi internal.",
    };

    await seed(
      {
        // Somebody moved them to Finance after the request was approved.
        employees: [employee({ department: "Finance", objectGUID: "guid-rizky" })],
        lifecycleRequests: [
          request({
            payload: movement,
            employeeId: "emp_1",
            beforeSnapshot: {
              displayName: "Rizky Maulana",
              email: "rizky.maulana@example.com",
              department: "IT — Engineering",
              jobTitle: "Senior Backend Engineer",
              managerEmail: "sarah.wijaya@example.com",
              status: "ACTIVE",
            },
          }),
        ],
      },
      [adAccount()],
    );

    const report = await runDueJobs({ workerId: "w1" });

    expect(report.outcomes[0].errorCode).toBe("DRIFT");
    // Not a directory failure and not retryable: the approval was given for a
    // situation that no longer holds.
    const [account] = await readMockDirectory();
    expect(account.department).toBe("IT — Engineering");
    expect((await store()).employees[0].department).toBe("Finance");
  });
});

describe("an employee never linked to a directory object", () => {
  it("fails before touching the directory, and says why", async () => {
    const termination: LifecyclePayload = {
      kind: "TERMINATION",
      employeeId: "emp_1",
      reasonCategory: "RESIGN",
      lastWorkingDate: "2026-10-31",
    };

    // No objectGUID on the record, and nothing in the directory to adopt.
    await seed({
      employees: [employee()],
      lifecycleRequests: [request({ payload: termination, employeeId: "emp_1" })],
    });

    const report = await runDueJobs({ workerId: "w1" });

    expect(report.outcomes[0].errorCode).toBe("AD_NOT_FOUND");
    // The message has to name the actual problem — an unlinked record — rather
    // than report an undefined object nobody can act on.
    expect(report.outcomes[0].errorMessage).toMatch(/belum tertaut/);
    expect(report.outcomes[0].completedSteps).toEqual([]);
  });

  it("adopts an existing account rather than declaring the person absent", async () => {
    const termination: LifecyclePayload = {
      kind: "TERMINATION",
      employeeId: "emp_1",
      reasonCategory: "RESIGN",
      lastWorkingDate: "2026-10-31",
    };

    // The record carries no GUID, but the account is plainly there.
    await seed(
      {
        employees: [employee()],
        lifecycleRequests: [request({ payload: termination, employeeId: "emp_1" })],
      },
      [adAccount()],
    );

    const report = await runDueJobs({ workerId: "w1" });

    expect(report.completed).toBe(1);
    expect((await readMockDirectory())[0].enabled).toBe(false);
  });
});

describe("termination", () => {
  it("disables the account first and marks the employee disabled once verified", async () => {
    const termination: LifecyclePayload = {
      kind: "TERMINATION",
      employeeId: "emp_1",
      reasonCategory: "RESIGN",
      lastWorkingDate: "2026-10-31",
    };

    await seed(
      {
        employees: [employee({ objectGUID: "guid-rizky" })],
        lifecycleRequests: [request({ payload: termination, employeeId: "emp_1" })],
      },
      [adAccount()],
    );

    const report = await runDueJobs({ workerId: "w1" });
    expect(report.completed).toBe(1);

    const [account] = await readMockDirectory();
    expect(account.enabled).toBe(false);
    expect(account.groups).toEqual([]);
    expect((await store()).employees[0].status).toBe("DISABLED");
  });
});

describe("a read that fails mid-job", () => {
  it("fails the job rather than stranding it in EXECUTING", async () => {
    // The verification read-back is the dangerous one: every write has already
    // happened by the time it runs.
    const termination: LifecyclePayload = {
      kind: "TERMINATION",
      employeeId: "emp_1",
      reasonCategory: "RESIGN",
      lastWorkingDate: "2026-10-31",
    };

    await seed(
      {
        employees: [employee({ objectGUID: "guid-rizky" })],
        lifecycleRequests: [request({ payload: termination, employeeId: "emp_1" })],
      },
      [adAccount()],
    );

    // Fails every call, including the reads that used to escape the try/catch.
    vi.stubEnv("AD_MOCK_FAULT", "permission");
    resetAdDriver();

    const report = await runDueJobs({ workerId: "w1" });

    expect(report.failed).toBe(1);
    // The important part: it is FAILED, not stuck.
    expect((await store()).lifecycleRequests[0].status).toBe("FAILED");
  });
});

describe("a worker that stopped without reporting", () => {
  it("fails the abandoned job instead of leaving it in EXECUTING forever", async () => {
    await seed({
      lifecycleRequests: [request({ payload: ONBOARDING, status: "EXECUTING" })],
      executionJobs: [
        {
          operationId: "lr_test:1",
          requestId: "lr_test",
          version: 1,
          payloadHash: "",
          state: "RUNNING",
          attempt: 1,
          steps: [],
          leaseWorkerId: "dead-worker",
          leaseExpiresAt: "2026-09-16T09:00:00.000Z",
          createdAt: "2026-09-16T09:00:00.000Z",
          updatedAt: "2026-09-16T09:00:00.000Z",
        },
      ],
    });

    const report = await runDueJobs({ workerId: "w2", now: new Date("2026-09-16T10:00:00.000Z") });

    expect(report.reclaimed).toBe(1);
    const after = await store();
    expect(after.lifecycleRequests[0].status).toBe("FAILED");
    expect(after.executionJobs[0].errorCode).toBe("LEASE_EXPIRED");
  });

  it("does not disturb a job whose lease is still held", async () => {
    await seed({
      lifecycleRequests: [request({ payload: ONBOARDING, status: "EXECUTING" })],
      executionJobs: [
        {
          operationId: "lr_test:1",
          requestId: "lr_test",
          version: 1,
          payloadHash: "",
          state: "RUNNING",
          attempt: 1,
          steps: [],
          leaseWorkerId: "busy-worker",
          leaseExpiresAt: "2099-01-01T00:00:00.000Z",
          createdAt: "2026-09-16T09:00:00.000Z",
          updatedAt: "2026-09-16T09:00:00.000Z",
        },
      ],
    });

    const report = await runDueJobs({ workerId: "w2", now: new Date("2026-09-16T10:00:00.000Z") });

    expect(report.reclaimed).toBe(0);
    expect((await store()).lifecycleRequests[0].status).toBe("EXECUTING");
  });
});

describe("scheduling", () => {
  it("leaves a request alone until its effective date arrives", async () => {
    await seed({
      lifecycleRequests: [
        request({
          payload: ONBOARDING,
          status: "SCHEDULED",
          effectiveAt: "2099-01-01T00:00:00.000Z",
        }),
      ],
    });

    const report = await runDueJobs({ workerId: "w1", now: new Date("2026-09-16T00:00:00.000Z") });

    expect(report.ran).toBe(0);
    expect((await store()).lifecycleRequests[0].status).toBe("SCHEDULED");
    expect(await readMockDirectory()).toHaveLength(0);
  });

  it("runs it once the date has passed", async () => {
    await seed({
      lifecycleRequests: [
        request({
          payload: ONBOARDING,
          status: "SCHEDULED",
          effectiveAt: "2026-09-01T00:00:00.000Z",
        }),
      ],
    });

    const report = await runDueJobs({ workerId: "w1", now: new Date("2026-09-16T00:00:00.000Z") });

    expect(report.completed).toBe(1);
  });
});

describe("the audit trail", () => {
  it("records the claim and the outcome against the request", async () => {
    await seed({ lifecycleRequests: [request({ payload: ONBOARDING })] });
    await runDueJobs({ workerId: "w1" });

    const actions = (await store()).auditEvents
      .filter((event) => event.correlationId === "lr_test")
      .map((event) => event.action);

    expect(actions).toEqual(["execution.claimed", "execution.completed"]);
    expect((await store()).auditEvents.every((event) => event.source === "WORKER")).toBe(true);
  });
});
