import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PortalSession } from "@/lib/auth/session";
import type { StoreShape } from "@/lib/db/store";

import { open } from "./outboxCrypto";
import type { ApprovalMailPayload } from "./outbox";
import {
  LifecycleError,
  createDraft,
  decideByToken,
  previewByToken,
  reviseRequest,
  submitRequest,
} from "./service";
import type { LifecyclePayload } from "./types";

/**
 * Deciding from the link in an email.
 *
 * The token is the only thing authenticating these calls, so what matters is
 * everything it refuses: a second use, a link for a version that has since been
 * revised, a link for the other stage.
 */

let workspace: string;
let storePath: string;

const HC: PortalSession = {
  userId: "ayu",
  username: "ayu",
  email: "ayu.prameswari@example.com",
  fullName: "Ayu Prameswari",
  roles: ["HC_REQUESTER"],
  createdAt: "2026-09-16T00:00:00.000Z",
  absoluteExpiresAt: "2026-09-17T00:00:00.000Z",
};

const TERMINATION: LifecyclePayload = {
  kind: "TERMINATION",
  employeeId: "emp_1",
  reasonCategory: "RESIGN",
  lastWorkingDate: "2026-10-31",
};

async function store(): Promise<StoreShape> {
  return JSON.parse(await readFile(storePath, "utf8")) as StoreShape;
}

/** Pulls the raw token back out of the queued message, as the email would carry it. */
async function tokenFromOutbox(stage: "MANAGER" | "CISO"): Promise<string> {
  const { outboxEvents } = await store();
  const event = outboxEvents.find(
    (candidate) => candidate.kind === "approval.request" && candidate.stage === stage,
  );
  const payload = JSON.parse(open(event!.sealedPayload!)) as ApprovalMailPayload;
  return payload.token!;
}

/** A submitted termination, with an employee to hang it on. */
async function raise() {
  await mutateEmployee();
  const draft = await createDraft({ payload: TERMINATION }, HC);
  return submitRequest(draft.id, draft.version, HC);
}

async function mutateEmployee() {
  const { mutateStore } = await import("@/lib/db/store");
  await mutateStore((draft) => {
    draft.employees.push({
      id: "emp_1",
      firstName: "Rizky",
      lastName: "Maulana",
      displayName: "Rizky Maulana",
      email: "rizky.maulana@example.com",
      jobTitle: "Senior Backend Engineer",
      department: "IT — Engineering",
      managerName: "Sarah Wijaya",
      managerEmail: "sarah.wijaya@example.com",
      status: "ACTIVE",
      createdAt: "2026-01-06T09:00:00.000Z",
      updatedAt: "2026-01-06T09:00:00.000Z",
    });
  });
}

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "hc-token-"));
  storePath = path.join(workspace, "store.json");
  vi.stubEnv("HC_DATA_FILE", storePath);
  vi.stubEnv("CISO_APPROVER_EMAIL", "ciso@example.com");
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(workspace, { recursive: true, force: true });
});

describe("the link that arrives in the email", () => {
  it("shows what it is about without deciding anything", async () => {
    const request = await raise();
    const token = await tokenFromOutbox("MANAGER");

    const preview = await previewByToken(token);

    expect(preview.ok).toBe(true);
    // Opening it must not move the request: mail scanners follow every URL.
    expect((await store()).lifecycleRequests[0].status).toBe("PENDING_MANAGER");
    expect(request.status).toBe("PENDING_MANAGER");
  });

  it("records the decision against the approver it was addressed to", async () => {
    await raise();
    const token = await tokenFromOutbox("MANAGER");

    const after = await decideByToken(token, { decision: "APPROVED" });

    expect(after.status).toBe("PENDING_CISO");
    // Credited to Sarah, not to "whoever clicked": the link proves delivery,
    // not identity.
    expect(after.approvals[0].decidedBy?.email).toBe("sarah.wijaya@example.com");
  });

  it("is recorded in the audit trail as coming from email, not the portal", async () => {
    await raise();
    await decideByToken(await tokenFromOutbox("MANAGER"), { decision: "APPROVED" });

    const approved = (await store()).auditEvents.find(
      (event) => event.action === "request.approved",
    );
    expect(approved?.source).toBe("EMAIL");
  });
});

describe("what the link refuses", () => {
  it("cannot be used twice", async () => {
    await raise();
    const token = await tokenFromOutbox("MANAGER");
    await decideByToken(token, { decision: "APPROVED" });

    await expect(decideByToken(token, { decision: "APPROVED" })).rejects.toThrow(LifecycleError);
  });

  it("dies when the request is revised", async () => {
    const request = await raise();
    const token = await tokenFromOutbox("MANAGER");

    await reviseRequest(request.id, { ...TERMINATION, lastWorkingDate: "2026-11-30" }, HC);

    // The approver was asked about text that no longer exists.
    await expect(decideByToken(token, { decision: "APPROVED" })).rejects.toThrow(/tidak berlaku/);
  });

  it("refuses a rejection with no reason", async () => {
    await raise();
    const token = await tokenFromOutbox("MANAGER");

    await expect(decideByToken(token, { decision: "REJECTED" })).rejects.toThrow(/Alasan/);
  });

  it("rejects a value nobody issued", async () => {
    await raise();

    await expect(decideByToken("not-a-token", { decision: "APPROVED" })).rejects.toThrow(
      /tidak dikenali/,
    );
  });

  it("does not exist for the CISO until the manager has answered", async () => {
    await raise();

    // The ordering guarantee is structural rather than a check at decision
    // time: no CISO link is issued at all while the request is still waiting on
    // the manager, so there is nothing to use out of turn.
    const { outboxEvents, approvalTokens } = await store();
    expect(outboxEvents.filter((event) => event.stage === "CISO")).toHaveLength(0);
    expect(approvalTokens.filter((token) => token.stage === "CISO")).toHaveLength(0);
    expect(approvalTokens.filter((token) => token.stage === "MANAGER")).toHaveLength(1);
  });
});

describe("the whole chain by email", () => {
  it("walks manager then CISO and lands in the execution queue", async () => {
    await raise();

    await decideByToken(await tokenFromOutbox("MANAGER"), { decision: "APPROVED" });
    const final = await decideByToken(await tokenFromOutbox("CISO"), { decision: "APPROVED" });

    // Approved, queued — not completed. Nothing has touched a directory.
    expect(final.status).toBe("QUEUED");
  });

  it("revokes every outstanding link once the request closes", async () => {
    await raise();
    await decideByToken(await tokenFromOutbox("MANAGER"), { decision: "APPROVED" });
    await decideByToken(await tokenFromOutbox("CISO"), {
      decision: "REJECTED",
      reason: "Akses masih dibutuhkan.",
    });

    const { approvalTokens } = await store();
    expect(approvalTokens.every((token) => token.consumedAt || token.revokedAt)).toBe(true);
  });
});
