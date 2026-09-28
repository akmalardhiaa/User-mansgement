import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PortalSession } from "@/lib/auth/session";
import type { StoreShape } from "@/lib/db/store";

import type { ApprovalMailPayload } from "./outbox";
import { open } from "./outboxCrypto";
import { renderEmail } from "./renderEmail";
import {
  LifecycleError,
  createDraft,
  decide,
  decideByToken,
  previewByToken,
  reviseAndResubmit,
  submitRequest,
} from "./service";
import type {
  LifecyclePayload,
  OnboardingPayload,
  ProfileUpdatePayload,
  TerminationPayload,
} from "./types";

/**
 * A revision goes straight back out.
 *
 * The properties that make that safe are the ones tested here: the old version's
 * approvals and links die with it, the new version reaches the manager in the
 * same transaction, and when the resubmit cannot happen nothing changes at all.
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

/** Another HC officer: allowed to raise requests, not to revise Ayu's. */
const OTHER_HC: PortalSession = {
  ...HC,
  userId: "yoga",
  username: "yoga",
  email: "yoga.pratama@example.com",
  fullName: "Yoga Pratama",
};

const MANAGER: PortalSession = {
  ...HC,
  userId: "sarah",
  username: "sarah",
  email: "sarah.wijaya@example.com",
  fullName: "Sarah Wijaya",
  roles: [],
};

const CISO: PortalSession = {
  ...HC,
  userId: "ciso",
  username: "ciso",
  email: "ciso@example.com",
  fullName: "Dimas Anggara",
  roles: [],
};

/** Rizky, from the seed roster. His manager of record is Sarah. */
const RIZKY = "emp_seed_002";
const YOGA = "emp_seed_006";

const TERMINATION: TerminationPayload = {
  kind: "TERMINATION",
  employeeId: RIZKY,
  reasonCategory: "RESIGN",
  lastWorkingDate: "2026-10-31",
};

const ONBOARDING: OnboardingPayload = {
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

async function raise(payload: LifecyclePayload) {
  const draft = await createDraft({ payload }, HC);
  return submitRequest(draft.id, draft.version, HC);
}

async function store(): Promise<StoreShape> {
  return JSON.parse(await readFile(storePath, "utf8")) as StoreShape;
}

/** The newest queued approval email for a stage, opened as the email would carry it. */
async function latestMail(stage: "MANAGER" | "CISO"): Promise<ApprovalMailPayload> {
  const { outboxEvents } = await store();
  const events = outboxEvents.filter(
    (candidate) => candidate.kind === "approval.request" && candidate.stage === stage,
  );
  return JSON.parse(open(events[events.length - 1].sealedPayload!)) as ApprovalMailPayload;
}

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "hc-revise-"));
  storePath = path.join(workspace, "store.json");
  vi.stubEnv("HC_DATA_FILE", storePath);
  vi.stubEnv("CISO_APPROVER_EMAIL", "ciso@example.com");
  vi.stubEnv("CISO_APPROVER_NAME", "Dimas Anggara");
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(workspace, { recursive: true, force: true });
});

describe("revising sends it straight back", () => {
  it("to the manager, as a new version with every earlier approval voided", async () => {
    const request = await raise(TERMINATION);
    await decide(request.id, { version: 1, stage: "MANAGER", decision: "APPROVED" }, MANAGER);

    const revised = await reviseAndResubmit(
      request.id,
      1,
      { ...TERMINATION, lastWorkingDate: "2026-11-30" },
      HC,
    );

    expect(revised.status).toBe("PENDING_MANAGER");
    expect(revised.version).toBe(2);
    expect(revised.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    // The manager's earlier "yes" was for text that no longer exists.
    expect(revised.approvals.every((step) => step.version === 2 && !step.decision)).toBe(true);

    const mail = await latestMail("MANAGER");
    expect(mail.version).toBe(2);

    const { auditEvents } = await store();
    const actions = auditEvents.map((event) => event.action);
    expect(actions.slice(-2)).toEqual(["request.revised", "request.submitted"]);
  });

  it("with an email that says it is a revision", async () => {
    const request = await raise(TERMINATION);
    await reviseAndResubmit(request.id, 1, { ...TERMINATION, lastWorkingDate: "2026-11-30" }, HC);

    const mail = renderEmail(await latestMail("MANAGER"), "sarah.wijaya@example.com");
    expect(mail.subject).toContain("(revisi v2)");
    expect(mail.html).toContain("sudah direvisi (versi 2)");
  });

  it("recomputing a profile update's diff against the record", async () => {
    const payload: ProfileUpdatePayload = {
      kind: "PROFILE_UPDATE",
      employeeId: RIZKY,
      profile: {
        firstName: "Rizky",
        lastName: "Maulana",
        displayName: "Rizky Maulana",
        jobTitle: "Senior Backend Engineer",
        department: "IT — Security",
      },
      changes: [],
    };
    const request = await raise(payload);

    const revised = await reviseAndResubmit(
      request.id,
      1,
      { ...payload, profile: { ...payload.profile, department: "Finance" } },
      HC,
    );

    expect(revised.payload.kind === "PROFILE_UPDATE" && revised.payload.changes).toEqual([
      { field: "department", label: "Departemen", from: "IT — Engineering", to: "Finance" },
    ]);
  });
});

describe("what a revision kills", () => {
  it("every link issued for the old version, while the new one works", async () => {
    const request = await raise(TERMINATION);
    const oldLink = (await latestMail("MANAGER")).token!;

    await reviseAndResubmit(request.id, 1, { ...TERMINATION, lastWorkingDate: "2026-11-30" }, HC);

    await expect(decideByToken(oldLink, { decision: "APPROVED" })).rejects.toThrow(/tidak berlaku/);

    const newLink = (await latestMail("MANAGER")).token!;
    const decided = await decideByToken(newLink, { decision: "APPROVED" });
    expect(decided.status).toBe("PENDING_CISO");
  });
});

describe("what a revision refuses", () => {
  it("a stale tab, rather than overwriting a version its user never saw", async () => {
    const request = await raise(TERMINATION);
    await reviseAndResubmit(request.id, 1, { ...TERMINATION, lastWorkingDate: "2026-11-30" }, HC);

    await expect(
      reviseAndResubmit(request.id, 1, { ...TERMINATION, lastWorkingDate: "2026-12-31" }, HC),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const { lifecycleRequests } = await store();
    expect(lifecycleRequests[0].version).toBe(2);
  });

  it("swapping the employee the request is about", async () => {
    const request = await raise(TERMINATION);

    await expect(
      reviseAndResubmit(request.id, 1, { ...TERMINATION, employeeId: YOGA }, HC),
    ).rejects.toMatchObject({ code: "INVALID" });
  });

  it("anybody but the requester", async () => {
    const request = await raise(TERMINATION);

    await expect(
      reviseAndResubmit(request.id, 1, { ...TERMINATION, lastWorkingDate: "2026-11-30" }, OTHER_HC),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a request that is already approved and waiting to run", async () => {
    const request = await raise(TERMINATION);
    await decide(request.id, { version: 1, stage: "MANAGER", decision: "APPROVED" }, MANAGER);
    await decide(request.id, { version: 1, stage: "CISO", decision: "APPROVED" }, CISO);

    await expect(
      reviseAndResubmit(request.id, 1, { ...TERMINATION, lastWorkingDate: "2026-11-30" }, HC),
    ).rejects.toThrow();
  });

  it("and when the resubmit is refused, changes nothing at all", async () => {
    const request = await raise(ONBOARDING);
    const link = (await latestMail("MANAGER")).token!;

    // Routing the revision to the requester herself is a separation-of-duties
    // clash — discovered only at resubmit, after the revision was applied.
    await expect(
      reviseAndResubmit(
        request.id,
        1,
        { ...ONBOARDING, managerName: "Ayu Prameswari", managerEmail: "ayu.prameswari@example.com" },
        HC,
      ),
    ).rejects.toThrow(/Pemohon tidak boleh/);

    const { lifecycleRequests, outboxEvents } = await store();
    expect(lifecycleRequests[0]).toMatchObject({ status: "PENDING_MANAGER", version: 1 });
    expect(outboxEvents.filter((event) => event.kind === "approval.request")).toHaveLength(1);
    // The link already in the manager's inbox still works: nothing was revoked.
    expect((await previewByToken(link)).ok).toBe(true);
  });
});

it("is a LifecycleError the API can map, not a crash", async () => {
  const request = await raise(TERMINATION);
  await expect(
    reviseAndResubmit(request.id, 7, TERMINATION, HC),
  ).rejects.toBeInstanceOf(LifecycleError);
});
