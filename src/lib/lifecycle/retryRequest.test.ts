import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PortalSession } from "@/lib/auth/session";
import type { StoreShape } from "@/lib/db/store";

import type { ExecutionJob } from "./executionTypes";
import { hashPayload } from "./payload";
import { LifecycleError, retryRequest } from "./service";
import type { LifecyclePayload, LifecycleRequest, LifecycleStatus } from "./types";

/**
 * Putting a failed execution back in the queue.
 *
 * The interesting cases are the refusals. A retry is the right answer to "the
 * directory was briefly unreachable" and the wrong answer to "the account has
 * changed since this was approved" — and telling those apart is the entire
 * value of the endpoint.
 */

let workspace: string;
let storePath: string;

const OPS: PortalSession = {
  userId: "ops",
  username: "ops",
  email: "ops@example.com",
  fullName: "Operator",
  roles: ["OPS_OPERATOR"],
  createdAt: "2026-09-16T00:00:00.000Z",
  absoluteExpiresAt: "2026-09-17T00:00:00.000Z",
};

const PAYLOAD: LifecyclePayload = {
  kind: "TERMINATION",
  employeeId: "emp_1",
  reasonCategory: "RESIGN",
  lastWorkingDate: "2026-10-31",
};

function request(status: LifecycleStatus = "FAILED"): LifecycleRequest {
  return {
    id: "lr_1",
    type: "TERMINATION",
    version: 1,
    status,
    requester: { name: "Ayu", email: "ayu@example.com", userId: "ayu" },
    employeeId: "emp_1",
    subject: { displayName: "Rizky Maulana" },
    payload: PAYLOAD,
    payloadHash: hashPayload(PAYLOAD),
    approvals: [],
    policyVersion: "2026-09-16.1",
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
  };
}

function job(errorCode?: string): ExecutionJob {
  return {
    operationId: "lr_1:1",
    requestId: "lr_1",
    version: 1,
    payloadHash: hashPayload(PAYLOAD),
    state: "FAILED",
    attempt: 1,
    steps: [{ stepKey: "disable-account", state: "DONE", at: "2026-09-16T00:00:00.000Z" }],
    errorCode,
    errorMessage: "sesuatu gagal",
    finishedAt: "2026-09-16T00:05:00.000Z",
    leaseWorkerId: "w1",
    leaseExpiresAt: "2026-09-16T00:06:00.000Z",
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:05:00.000Z",
  };
}

async function seed(requests: LifecycleRequest[], jobs: ExecutionJob[]): Promise<void> {
  const store: StoreShape = {
    employees: [],
    requests: [],
    activity: [],
    lifecycleRequests: requests,
    executionJobs: jobs,
    outboxEvents: [],
    emailDeliveries: [],
    approvalTokens: [],
    auditEvents: [],
  };
  await writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

async function store(): Promise<StoreShape> {
  return JSON.parse(await readFile(storePath, "utf8")) as StoreShape;
}

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "hc-retry-"));
  storePath = path.join(workspace, "store.json");
  vi.stubEnv("HC_DATA_FILE", storePath);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(workspace, { recursive: true, force: true });
});

describe("a retry that should be allowed", () => {
  it("queues the request again and clears the stale error", async () => {
    await seed([request()], [job("AD_UNAVAILABLE")]);

    const after = await retryRequest("lr_1", OPS);
    expect(after.status).toBe("QUEUED");

    const stored = (await store()).executionJobs[0];
    expect(stored.errorCode).toBeUndefined();
    expect(stored.finishedAt).toBeUndefined();
    // The lease is released so a worker can claim it.
    expect(stored.leaseWorkerId).toBeUndefined();
  });

  it("keeps the checkpoints, so the retry resumes instead of restarting", async () => {
    await seed([request()], [job("AD_UNAVAILABLE")]);
    await retryRequest("lr_1", OPS);

    // Re-running a completed create-account is how a second account appears.
    expect((await store()).executionJobs[0].steps).toHaveLength(1);
    expect((await store()).executionJobs[0].steps[0].stepKey).toBe("disable-account");
  });

  it("records who asked for it and what had failed", async () => {
    await seed([request()], [job("AD_UNAVAILABLE")]);
    await retryRequest("lr_1", OPS);

    const event = (await store()).auditEvents.find(
      (candidate) => candidate.action === "execution.retry_requested",
    );
    expect(event?.actorName).toBe("Operator");
    expect(event?.detail).toMatchObject({ previousError: "AD_UNAVAILABLE" });
  });
});

describe("failures a retry cannot fix", () => {
  it("refuses a job that failed because the account had drifted", async () => {
    // Repeating it would apply a change that no longer matches what was agreed.
    await seed([request()], [job("DRIFT")]);

    await expect(retryRequest("lr_1", OPS)).rejects.toThrow(/Ajukan ulang/);
    expect((await store()).lifecycleRequests[0].status).toBe("FAILED");
  });

  it("refuses a payload that no longer matches its fingerprint", async () => {
    await seed([request()], [job("PAYLOAD_MISMATCH")]);

    await expect(retryRequest("lr_1", OPS)).rejects.toThrow(LifecycleError);
  });
});

describe("a worker that vanished", () => {
  it("will not retry until somebody says they have reconciled it", async () => {
    // The directory may be part-way changed by a process nobody can ask.
    await seed([request()], [job("LEASE_EXPIRED")]);

    await expect(retryRequest("lr_1", OPS)).rejects.toThrow(/rekonsiliasi/);
  });

  it("proceeds once the reconciliation is acknowledged, and records the claim", async () => {
    await seed([request()], [job("LEASE_EXPIRED")]);

    const after = await retryRequest("lr_1", OPS, { acknowledgedReconciliation: true });
    expect(after.status).toBe("QUEUED");

    const event = (await store()).auditEvents.find(
      (candidate) => candidate.action === "execution.retry_requested",
    );
    // No code can verify somebody looked, so the assertion is recorded as
    // something a named person claimed.
    expect(event?.detail).toMatchObject({ reconciliationAcknowledged: true });
  });
});

describe("requests that are not failed", () => {
  it("refuses anything that is not in FAILED", async () => {
    await seed([request("QUEUED")], [job()]);

    await expect(retryRequest("lr_1", OPS)).rejects.toThrow(/FAILED/);
  });
});
