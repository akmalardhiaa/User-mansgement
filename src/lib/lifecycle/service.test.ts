import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PortalSession } from "@/lib/auth/session";

import { SeparationOfDutiesError } from "./routing";
import {
  LifecycleError,
  auditTrailFor,
  cancelRequest,
  createDraft,
  decide,
  getRequest,
  reviseRequest,
  submitRequest,
} from "./service";
import type { LifecyclePayload, MovementPayload, TerminationPayload } from "./types";

/**
 * These run against a real store file in a temp directory rather than a mock.
 *
 * The rules being checked here are about atomicity and about what survives a
 * write — "one active request per employee", "a decision is recorded once" —
 * and a mocked repository would be asserting that the mock behaves, not that
 * the rule holds.
 */

let workspace: string;

const HC: PortalSession = {
  userId: "ayu",
  username: "ayu",
  email: "ayu.prameswari@example.com",
  fullName: "Ayu Prameswari",
  roles: ["HC_REQUESTER"],
  createdAt: "2026-09-16T00:00:00.000Z",
  absoluteExpiresAt: "2026-09-17T00:00:00.000Z",
};

const MANAGER: PortalSession = {
  ...HC,
  userId: "sarah",
  username: "sarah",
  email: "sarah.wijaya@example.com",
  fullName: "Sarah Wijaya",
  roles: ["MANAGER"],
};

const CISO: PortalSession = {
  ...HC,
  userId: "ciso",
  username: "ciso",
  email: "ciso@example.com",
  fullName: "Dimas Anggara",
  roles: ["CISO_APPROVER"],
};

const INTRUDER: PortalSession = {
  ...HC,
  userId: "yoga",
  username: "yoga",
  email: "yoga.pratama@example.com",
  fullName: "Yoga Pratama",
  roles: ["MANAGER"],
};

/** Rizky, from the seed roster. His manager of record is Sarah. */
const RIZKY = "emp_seed_002";

function termination(overrides: Partial<TerminationPayload> = {}): TerminationPayload {
  return {
    kind: "TERMINATION",
    employeeId: RIZKY,
    reasonCategory: "RESIGN",
    lastWorkingDate: "2026-10-31",
    ...overrides,
  };
}

function movement(overrides: Partial<MovementPayload> = {}): MovementPayload {
  return {
    kind: "MOVEMENT",
    employeeId: RIZKY,
    toDepartment: "IT — Security",
    toJobTitle: "Security Engineer",
    toManagerName: "Sarah Wijaya",
    toManagerEmail: "sarah.wijaya@example.com",
    accessProfileId: "security",
    reason: "Rotasi internal.",
    ...overrides,
  };
}

/** Draft then submit, which is what every test that needs a live request wants. */
async function raise(payload: LifecyclePayload, effectiveAt?: string) {
  const draft = await createDraft({ payload, effectiveAt }, HC);
  return submitRequest(draft.id, draft.version, HC);
}

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "hc-lifecycle-"));
  process.env.HC_DATA_FILE = path.join(workspace, "store.json");
  process.env.CISO_APPROVER_EMAIL = "ciso@example.com";
  process.env.CISO_APPROVER_NAME = "Dimas Anggara";
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe("submitting", () => {
  it("freezes the payload and records both approvers up front", async () => {
    const request = await raise(termination());

    expect(request.status).toBe("PENDING_MANAGER");
    expect(request.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(request.approvals.map((step) => step.stage)).toEqual(["MANAGER", "CISO"]);
    // Termination routes to the employee's current manager.
    expect(request.approvals[0].approver.email).toBe("sarah.wijaya@example.com");
    expect(request.approvals[1].approver.email).toBe("ciso@example.com");
  });

  it("captures what the account looked like when the request was raised", async () => {
    const request = await raise(termination());

    expect(request.beforeSnapshot).toMatchObject({
      department: "IT — Engineering",
      managerEmail: "sarah.wijaya@example.com",
      status: "ACTIVE",
    });
  });

  it("refuses a second live request for the same employee", async () => {
    await raise(termination());

    await expect(createDraft({ payload: movement() }, HC)).rejects.toThrow(LifecycleError);
  });

  it("allows a new request once the previous one is closed", async () => {
    const first = await raise(termination());
    await cancelRequest(first.id, HC, "Salah orang.");

    await expect(createDraft({ payload: movement() }, HC)).resolves.toBeDefined();
  });

  it("refuses to route a request where the requester would approve it", async () => {
    const selfApproving: PortalSession = { ...HC, email: "sarah.wijaya@example.com", userId: "sarah" };
    const draft = await createDraft({ payload: termination() }, selfApproving);

    await expect(submitRequest(draft.id, draft.version, selfApproving)).rejects.toThrow(
      SeparationOfDutiesError,
    );
  });

  it("refuses a stale version", async () => {
    const draft = await createDraft({ payload: termination() }, HC);

    await expect(submitRequest(draft.id, draft.version + 1, HC)).rejects.toThrow(LifecycleError);
  });
});

describe("deciding", () => {
  it("walks both approvals and lands in the execution queue, not COMPLETED", async () => {
    const request = await raise(termination());

    const afterManager = await decide(
      request.id,
      { version: 1, stage: "MANAGER", decision: "APPROVED" },
      MANAGER,
    );
    expect(afterManager.status).toBe("PENDING_CISO");

    const afterCiso = await decide(
      request.id,
      { version: 1, stage: "CISO", decision: "APPROVED" },
      CISO,
    );
    // The second approval authorises the change. It does not perform it.
    expect(afterCiso.status).toBe("QUEUED");
  });

  it("parks a request whose effective date has not arrived", async () => {
    const request = await raise(termination(), "2099-01-01T00:00:00.000Z");

    await decide(request.id, { version: 1, stage: "MANAGER", decision: "APPROVED" }, MANAGER);
    const done = await decide(request.id, { version: 1, stage: "CISO", decision: "APPROVED" }, CISO);

    expect(done.status).toBe("SCHEDULED");
  });

  it("refuses somebody who holds the role but is not the designated approver", async () => {
    const request = await raise(termination());

    // Yoga is a MANAGER. He is not THIS request's manager.
    await expect(
      decide(request.id, { version: 1, stage: "MANAGER", decision: "APPROVED" }, INTRUDER),
    ).rejects.toThrow(/approver lain/);
  });

  it("refuses the CISO stage while the manager has not answered", async () => {
    const request = await raise(termination());

    await expect(
      decide(request.id, { version: 1, stage: "CISO", decision: "APPROVED" }, CISO),
    ).rejects.toThrow(/menunggu tahap MANAGER/);
  });

  it("treats a repeated identical decision as one decision", async () => {
    const request = await raise(termination());

    await decide(request.id, { version: 1, stage: "MANAGER", decision: "APPROVED" }, MANAGER);
    const again = await decide(
      request.id,
      { version: 1, stage: "MANAGER", decision: "APPROVED" },
      MANAGER,
    );

    expect(again.status).toBe("PENDING_CISO");
    const approvals = (await auditTrailFor(request.id)).filter(
      (event) => event.action === "request.approved",
    );
    expect(approvals).toHaveLength(1);
  });

  it("will not let an answered stage be changed", async () => {
    const request = await raise(termination());
    await decide(request.id, { version: 1, stage: "MANAGER", decision: "APPROVED" }, MANAGER);

    await expect(
      decide(request.id, { version: 1, stage: "MANAGER", decision: "REJECTED", reason: "Berubah pikiran." }, MANAGER),
    ).rejects.toThrow(LifecycleError);
  });

  it("requires a reason to reject", async () => {
    const request = await raise(termination());

    await expect(
      decide(request.id, { version: 1, stage: "MANAGER", decision: "REJECTED" }, MANAGER),
    ).rejects.toThrow(/Alasan penolakan/);
  });

  it("ends the request on rejection, with the reason recorded", async () => {
    const request = await raise(termination());

    const rejected = await decide(
      request.id,
      { version: 1, stage: "MANAGER", decision: "REJECTED", reason: "Serah terima belum siap." },
      MANAGER,
    );

    expect(rejected.status).toBe("REJECTED");
    expect(rejected.closedReason).toBe("Serah terima belum siap.");
    expect(rejected.approvals[1].decision).toBeUndefined();
  });
});

describe("revising", () => {
  it("voids approvals already given and starts a new version", async () => {
    const request = await raise(movement());
    await decide(request.id, { version: 1, stage: "MANAGER", decision: "APPROVED" }, MANAGER);

    const revised = await reviseRequest(
      request.id,
      movement({ toJobTitle: "Lead Security Engineer" }),
      HC,
    );

    expect(revised.version).toBe(2);
    expect(revised.status).toBe("DRAFT");
    expect(revised.approvals).toEqual([]);
    expect(revised.payloadHash).toBe("");
  });

  it("cannot revise a request that is already approved and queued", async () => {
    const request = await raise(termination());
    await decide(request.id, { version: 1, stage: "MANAGER", decision: "APPROVED" }, MANAGER);
    await decide(request.id, { version: 1, stage: "CISO", decision: "APPROVED" }, CISO);

    await expect(reviseRequest(request.id, termination(), HC)).rejects.toThrow();
  });
});

describe("what each person can see", () => {
  it("shows an approver the request routed to them", async () => {
    const request = await raise(termination());

    await expect(getRequest(request.id, MANAGER)).resolves.toMatchObject({ id: request.id });
  });

  it("hides a request from a role-holder it was not routed to", async () => {
    const request = await raise(termination());

    // Reported as missing rather than forbidden: confirming it exists would
    // leak that somebody is being terminated.
    await expect(getRequest(request.id, INTRUDER)).rejects.toThrow(/tidak ditemukan/);
  });
});

describe("the audit trail", () => {
  it("records every transition alongside the change itself", async () => {
    const request = await raise(termination());
    await decide(request.id, { version: 1, stage: "MANAGER", decision: "APPROVED" }, MANAGER);
    await decide(request.id, { version: 1, stage: "CISO", decision: "APPROVED" }, CISO);

    const actions = (await auditTrailFor(request.id)).map((event) => event.action);

    expect(actions).toEqual([
      "request.drafted",
      "request.submitted",
      "request.approved",
      "request.approved",
      "request.queued",
    ]);
  });

  it("names who took each decision", async () => {
    const request = await raise(termination());
    await decide(request.id, { version: 1, stage: "MANAGER", decision: "APPROVED" }, MANAGER);

    const approval = (await auditTrailFor(request.id)).find(
      (event) => event.action === "request.approved",
    );

    expect(approval?.actorId).toBe("sarah");
    expect(approval?.actorName).toBe("Sarah Wijaya");
  });
});
