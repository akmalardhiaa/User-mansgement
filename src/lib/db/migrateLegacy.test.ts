import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { migrateLegacyWorkflow } from "./migrateLegacy";
import type { StoreShape } from "./store";

let workspace: string;
let storePath: string;

/** A store shaped like the real one: people stranded by the retired workflow. */
async function seedStore(): Promise<void> {
  const store: StoreShape = {
    employees: [
      employee("emp_join", "Citra Wulandari", "PENDING_MANAGER_APPROVAL"),
      employee("emp_setup", "Dewi Lestari", "PENDING_SECURITY_SETUP"),
      employee("emp_rejected", "Eko Prasetyo", "REJECTED"),
      employee("emp_moving", "Rizky Maulana", "PENDING_TRANSFER_SETUP"),
      employee("emp_fine", "Ayu Prameswari", "ACTIVE"),
      employee("emp_off", "Clara Halim", "DISABLED"),
      employee("emp_orphan", "Tanpa Jejak", "PENDING_MANAGER_APPROVAL"),
    ],
    requests: [
      legacyRequest("emp_join", "ONBOARDING", "MANAGER_APPROVAL"),
      legacyRequest("emp_setup", "ONBOARDING", "SECURITY_PROVISIONING"),
      legacyRequest("emp_rejected", "ONBOARDING", "REJECTED"),
      legacyRequest("emp_moving", "TRANSFER", "SECURITY_PROVISIONING"),
    ],
    activity: [],
    lifecycleRequests: [],
    executionJobs: [],
    outboxEvents: [],
    emailDeliveries: [],
    approvalTokens: [],
    auditEvents: [],
  };

  await writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

function employee(id: string, displayName: string, status: string) {
  return {
    id,
    firstName: displayName.split(" ")[0],
    lastName: displayName.split(" ").slice(1).join(" "),
    displayName,
    email: `${id}@example.com`,
    jobTitle: "Staff",
    department: "IT — Engineering",
    managerName: "Sarah Wijaya",
    managerEmail: "sarah.wijaya@example.com",
    status,
    createdAt: "2026-01-06T09:00:00.000Z",
    updatedAt: "2026-01-06T09:00:00.000Z",
  } as unknown as StoreShape["employees"][number];
}

function legacyRequest(employeeId: string, type: string, stage: string) {
  return {
    id: `req_${employeeId}`,
    employeeId,
    type,
    stage,
    events: [],
    processedSignals: [],
    createdAt: "2026-09-04T07:56:53.127Z",
    updatedAt: "2026-09-04T07:56:53.216Z",
  } as unknown as StoreShape["requests"][number];
}

async function readStoreFile(): Promise<StoreShape> {
  return JSON.parse(await readFile(storePath, "utf8")) as StoreShape;
}

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "hc-migrate-"));
  storePath = path.join(workspace, "store.json");
  process.env.HC_DATA_FILE = storePath;
  await seedStore();
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe("reconciling stranded employees", () => {
  it("closes accounts whose onboarding never finished", async () => {
    const report = await migrateLegacyWorkflow();
    const byId = new Map(report.reconciled.map((row) => [row.employeeId, row]));

    // No account was ever provisioned for any of these three.
    expect(byId.get("emp_join")?.to).toBe("DISABLED");
    expect(byId.get("emp_setup")?.to).toBe("DISABLED");
    expect(byId.get("emp_rejected")?.to).toBe("DISABLED");
  });

  it("keeps an account that already existed before the change was requested", async () => {
    const report = await migrateLegacyWorkflow();
    const moving = report.reconciled.find((row) => row.employeeId === "emp_moving");

    // Rizky was working the whole time; only his move never landed.
    expect(moving?.to).toBe("ACTIVE");
  });

  it("closes an account no legacy request explains, rather than guessing open", async () => {
    const report = await migrateLegacyWorkflow();
    const orphan = report.reconciled.find((row) => row.employeeId === "emp_orphan");

    expect(orphan?.to).toBe("DISABLED");
    expect(orphan?.reason).toMatch(/Tidak ada pengajuan lama/);
  });

  it("leaves accounts that were already in a real state alone", async () => {
    const report = await migrateLegacyWorkflow();
    const touched = report.reconciled.map((row) => row.employeeId);

    expect(touched).not.toContain("emp_fine");
    expect(touched).not.toContain("emp_off");
  });

  it("writes the reconciled statuses to the store", async () => {
    await migrateLegacyWorkflow();
    const store = await readStoreFile();
    const statuses = Object.fromEntries(store.employees.map((e) => [e.id, e.status]));

    expect(statuses).toMatchObject({
      emp_join: "DISABLED",
      emp_moving: "ACTIVE",
      emp_fine: "ACTIVE",
      emp_off: "DISABLED",
    });
  });
});

describe("archiving the legacy requests", () => {
  it("keeps them rather than deleting or converting them", async () => {
    const report = await migrateLegacyWorkflow();
    const store = await readStoreFile();

    expect(report.archivedRequests).toBe(4);
    // Still present: they are the only record those requests were ever raised.
    expect(store.requests).toHaveLength(4);
    // And never promoted into the new model, where they would look like
    // approvals somebody had actually verified.
    expect(store.lifecycleRequests).toHaveLength(0);
  });

  it("records what it did in the audit trail", async () => {
    await migrateLegacyWorkflow("Ayu Prameswari", "ayu");
    const store = await readStoreFile();

    const archived = store.auditEvents.find((event) => event.action === "legacy.archived");
    expect(archived?.actorName).toBe("Ayu Prameswari");
    expect(archived?.detail).toMatchObject({ archivedRequests: 4, reconciledEmployees: 5 });
    expect(store.auditEvents.filter((e) => e.action === "legacy.reconciled")).toHaveLength(5);
  });
});

describe("running it twice", () => {
  it("does nothing the second time", async () => {
    const first = await migrateLegacyWorkflow();
    const second = await migrateLegacyWorkflow();

    expect(first.alreadyDone).toBe(false);
    expect(second.alreadyDone).toBe(true);
    expect(second.reconciled).toEqual([]);
  });

  it("does not re-close an account an operator has since reopened", async () => {
    await migrateLegacyWorkflow();

    // An operator decides Citra should in fact have access.
    const store = await readStoreFile();
    const citra = store.employees.find((e) => e.id === "emp_join")!;
    citra.status = "ACTIVE";
    await writeFile(storePath, JSON.stringify(store, null, 2), "utf8");

    await migrateLegacyWorkflow();

    const after = await readStoreFile();
    expect(after.employees.find((e) => e.id === "emp_join")?.status).toBe("ACTIVE");
  });
});
