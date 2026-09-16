import { randomUUID } from "node:crypto";

import type { PortalSession } from "@/lib/auth/session";
import { mutateStore, readStore, type StoreShape } from "@/lib/db/store";
import type { Employee } from "@/lib/types";

import { checkToken, hashEquals, hashToken } from "./approvalToken";
import { emitApprovalRequest, emitResult, revokeRequestTokens } from "./outbox";
import { hashPayload, payloadMatches } from "./payload";
import { assertSeparationOfDuties, isSamePerson, resolveRouting } from "./routing";
import {
  assertTransition,
  isActive,
  stageAwaiting,
  statusAfterApproval,
  statusAfterDecision,
} from "./stateMachine";
import type {
  ActorIdentity,
  ApprovalDecision,
  ApprovalStage,
  ApprovalStep,
  AuditEvent,
  LifecyclePayload,
  LifecycleRequest,
  LifecycleStatus,
  LifecycleType,
  RequestSubject,
} from "./types";

/**
 * Everything that changes a lifecycle request.
 *
 * Two properties this module exists to guarantee:
 *
 *   1. Every transition is atomic. The status change, the approval record, and
 *      the audit event are written in one store transaction, so there is no
 *      window in which a request has advanced but nothing says who advanced it.
 *      A log that can disagree with the data is worse than no log, because it
 *      gets trusted.
 *
 *   2. Every transition is checked against the request as it actually is —
 *      its id, version, status, payload fingerprint, and the identity of whoever
 *      is acting. A decision made about version 1 cannot advance version 2, and
 *      an approval addressed to one person cannot be exercised by another.
 *
 * The store underneath is a JSON file, which is the demo topology. Swapping it
 * for PostgreSQL means reimplementing the reads and writes here; the rules do
 * not move.
 */

/** The policy revision a request was raised under, recorded on each request. */
export const POLICY_VERSION = "2026-09-16.1";

export type LifecycleErrorCode = "NOT_FOUND" | "CONFLICT" | "FORBIDDEN" | "INVALID";

export class LifecycleError extends Error {
  constructor(
    readonly code: LifecycleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LifecycleError";
  }
}

function now(): string {
  return new Date().toISOString();
}

export function identityOf(session: PortalSession): ActorIdentity {
  return { name: session.fullName, email: session.email.toLowerCase(), userId: session.userId };
}

function audit(
  draft: StoreShape,
  event: Omit<AuditEvent, "id" | "at">,
): void {
  draft.auditEvents.push({ id: `evt_${randomUUID()}`, at: now(), ...event });
}

function findEmployee(draft: StoreShape, employeeId: string): Employee {
  const employee = draft.employees.find((candidate) => candidate.id === employeeId);
  if (!employee) throw new LifecycleError("NOT_FOUND", `Karyawan ${employeeId} tidak ditemukan.`);
  return employee;
}

function findRequest(draft: StoreShape, id: string): LifecycleRequest {
  const request = draft.lifecycleRequests.find((candidate) => candidate.id === id);
  if (!request) throw new LifecycleError("NOT_FOUND", "Pengajuan tidak ditemukan.");
  return request;
}

/**
 * Refuses a second in-flight request for the same person.
 *
 * Two approved payloads racing to change one account is how an account ends up
 * in a state neither request asked for. One at a time, until the first reaches
 * a terminal status.
 */
function assertNoActiveRequest(draft: StoreShape, employeeId: string, exceptId?: string): void {
  const clash = draft.lifecycleRequests.find(
    (candidate) =>
      candidate.employeeId === employeeId && candidate.id !== exceptId && isActive(candidate.status),
  );
  if (clash) {
    throw new LifecycleError(
      "CONFLICT",
      `Karyawan ini masih memiliki pengajuan aktif (${clash.id}) berstatus ${clash.status}. Selesaikan atau batalkan dulu.`,
    );
  }
}

function subjectFor(payload: LifecyclePayload, employee: Employee | undefined): RequestSubject {
  if (payload.kind === "ONBOARDING") {
    return {
      displayName: payload.displayName,
      email: payload.email,
      nik: payload.nik,
      department: payload.department,
    };
  }
  if (!employee) throw new LifecycleError("NOT_FOUND", "Karyawan yang diajukan tidak ditemukan.");
  return {
    displayName: employee.displayName,
    email: employee.email,
    department: employee.department,
  };
}

/**
 * The attributes execution will later compare against.
 *
 * Only what this request is about — not the whole record. A snapshot that
 * captures everything makes every unrelated edit look like drift.
 */
function snapshotOf(employee: Employee): Record<string, string> {
  return {
    displayName: employee.displayName,
    email: employee.email,
    department: employee.department,
    jobTitle: employee.jobTitle,
    managerEmail: employee.managerEmail,
    status: employee.status,
  };
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export interface ListOptions {
  type?: LifecycleType;
  status?: LifecycleStatus[];
  limit?: number;
  offset?: number;
}

export interface ListResult {
  requests: LifecycleRequest[];
  total: number;
}

/**
 * Requests this person is allowed to see.
 *
 * An approver sees what was routed to them, not the whole queue: being asked to
 * decide one request is not a reason to be shown everybody else's. HC and the
 * oversight roles see everything within their scope.
 */
export function visibleTo(request: LifecycleRequest, session: PortalSession): boolean {
  const broad = session.roles.some((role) =>
    ["HC_REQUESTER", "SYSTEM_ADMIN", "AUDITOR", "OPS_OPERATOR"].includes(role),
  );
  if (broad) return true;

  const me = identityOf(session);
  return (
    isSamePerson(request.requester, me) ||
    request.approvals.some((step) => isSamePerson(step.approver, me))
  );
}

export async function listRequests(
  session: PortalSession,
  options: ListOptions = {},
): Promise<ListResult> {
  const { lifecycleRequests } = await readStore();

  const matching = lifecycleRequests
    .filter((request) => visibleTo(request, session))
    .filter((request) => (options.type ? request.type === options.type : true))
    .filter((request) => (options.status?.length ? options.status.includes(request.status) : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const offset = Math.max(0, options.offset ?? 0);
  // Capped rather than unbounded: a list endpoint that will happily serialise
  // the whole table is a denial-of-service waiting for a large enough store.
  const limit = Math.min(Math.max(1, options.limit ?? 25), 100);

  return { requests: matching.slice(offset, offset + limit), total: matching.length };
}

export async function getRequest(
  id: string,
  session: PortalSession,
): Promise<LifecycleRequest> {
  const { lifecycleRequests } = await readStore();
  const request = lifecycleRequests.find((candidate) => candidate.id === id);

  // A request outside the caller's scope reports as missing rather than
  // forbidden: "you may not see this one" still confirms it exists.
  if (!request || !visibleTo(request, session)) {
    throw new LifecycleError("NOT_FOUND", "Pengajuan tidak ditemukan.");
  }
  return request;
}

export async function auditTrailFor(requestId: string): Promise<AuditEvent[]> {
  const { auditEvents } = await readStore();
  return auditEvents.filter((event) => event.correlationId === requestId);
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export interface CreateDraftInput {
  payload: LifecyclePayload;
  /** When the change should take effect. Absent means as soon as it is approved. */
  effectiveAt?: string;
}

/**
 * Opens a draft. Nothing is routed and nobody is asked yet.
 *
 * Deliberately separate from submitting: the version a decision refers to is
 * locked at submit, so there has to be a point before that where HC can still
 * change their mind cheaply.
 */
export async function createDraft(
  input: CreateDraftInput,
  session: PortalSession,
): Promise<LifecycleRequest> {
  const requester = identityOf(session);

  return mutateStore((draft) => {
    const employeeId =
      input.payload.kind === "ONBOARDING" ? undefined : input.payload.employeeId;
    const employee = employeeId ? findEmployee(draft, employeeId) : undefined;

    if (employeeId) assertNoActiveRequest(draft, employeeId);

    const timestamp = now();
    const request: LifecycleRequest = {
      id: `lr_${randomUUID()}`,
      type: typeOf(input.payload),
      version: 1,
      status: "DRAFT",
      requester,
      employeeId,
      subject: subjectFor(input.payload, employee),
      payload: input.payload,
      // Empty until submit: an unsubmitted draft has nothing to be held to.
      payloadHash: "",
      approvals: [],
      effectiveAt: input.effectiveAt,
      policyVersion: POLICY_VERSION,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    draft.lifecycleRequests.push(request);
    audit(draft, {
      actorId: requester.userId ?? requester.email,
      actorName: requester.name,
      source: "PORTAL",
      action: "request.drafted",
      target: request.id,
      correlationId: request.id,
      detail: { type: request.type, version: request.version },
    });

    return request;
  });
}

function typeOf(payload: LifecyclePayload): LifecycleType {
  return payload.kind;
}

/**
 * Locks the payload and asks the manager.
 *
 * This is where the request stops being editable and starts being something
 * people are asked to agree to: the payload is fingerprinted, the approvers are
 * resolved server-side and frozen onto the request, and separation of duties is
 * enforced before anybody is notified. Checking the clash here rather than at
 * decision time means a request that cannot legitimately be completed is never
 * raised in the first place.
 */
export async function submitRequest(
  id: string,
  expectedVersion: number,
  session: PortalSession,
): Promise<LifecycleRequest> {
  const actor = identityOf(session);

  return mutateStore((draft) => {
    const request = findRequest(draft, id);

    if (request.version !== expectedVersion) {
      throw new LifecycleError(
        "CONFLICT",
        `Pengajuan sudah berubah ke versi ${request.version}. Muat ulang sebelum mengirim.`,
      );
    }
    if (!isSamePerson(request.requester, actor)) {
      throw new LifecycleError("FORBIDDEN", "Hanya pemohon yang dapat mengirim pengajuan ini.");
    }

    assertTransition(request.status, "PENDING_MANAGER");

    const employee = request.employeeId ? findEmployee(draft, request.employeeId) : undefined;
    if (request.employeeId) assertNoActiveRequest(draft, request.employeeId, request.id);

    const routing = resolveRouting(request.payload, employee);
    assertSeparationOfDuties(request.requester, routing);

    // Both steps are created now, not one at a time: the identity asked to
    // approve each stage is part of what was decided at submit, and resolving
    // the CISO later would let a routing change slip in mid-flight.
    request.approvals = [
      { stage: "MANAGER", version: request.version, approver: routing.manager },
      { stage: "CISO", version: request.version, approver: routing.ciso },
    ];
    request.payloadHash = hashPayload(request.payload);
    request.beforeSnapshot = employee ? snapshotOf(employee) : undefined;
    request.status = "PENDING_MANAGER";
    request.submittedAt = now();
    request.updatedAt = request.submittedAt;

    audit(draft, {
      actorId: actor.userId ?? actor.email,
      actorName: actor.name,
      source: "PORTAL",
      action: "request.submitted",
      target: request.id,
      correlationId: request.id,
      detail: {
        version: request.version,
        payloadHash: request.payloadHash,
        manager: routing.manager.email,
        ciso: routing.ciso.email,
      },
    });

    // Committed with the submit, not after it: a crash here must not leave a
    // request routed to a manager who was never asked.
    emitApprovalRequest(draft, request, "MANAGER");

    return request;
  });
}

export interface DecisionInput {
  version: number;
  stage: ApprovalStage;
  decision: ApprovalDecision;
  reason?: string;
}

/**
 * Records one approval decision.
 *
 * Everything is verified against the stored request before anything moves: that
 * it is waiting for this stage, that the version matches, that the payload
 * still hashes to what was approved, and that whoever is answering is the person
 * the stage was addressed to. A button in a dashboard cannot manufacture a
 * manager's decision, and neither can a forwarded link.
 */
export async function decide(
  id: string,
  input: DecisionInput,
  session: PortalSession,
): Promise<LifecycleRequest> {
  const actor = identityOf(session);

  return mutateStore((draft) => {
    const request = findRequest(draft, id);

    if (request.version !== input.version) {
      throw new LifecycleError(
        "CONFLICT",
        `Keputusan menunjuk versi ${input.version}, sedangkan pengajuan sudah versi ${request.version}.`,
      );
    }

    const step = request.approvals.find(
      (candidate) => candidate.stage === input.stage && candidate.version === request.version,
    );
    if (!step) {
      throw new LifecycleError("CONFLICT", "Tahap persetujuan ini tidak ada pada versi tersebut.");
    }

    // Identity first, so somebody who simply holds the role is turned away
    // before any of the following can tell them anything about the request.
    if (!isSamePerson(step.approver, actor)) {
      throw new LifecycleError(
        "FORBIDDEN",
        "Keputusan ini ditujukan kepada approver lain. Anda tidak dapat memutuskannya.",
      );
    }

    /*
     * Then the replay check — and it has to come BEFORE asking whether the
     * request is waiting for this stage.
     *
     * A double-click sends the same decision twice. By the time the second one
     * arrives the first has already advanced the request to the next stage, so
     * a "are you the stage we are waiting for?" test would reject it — and the
     * person would be told their own successful approval had failed. The
     * already-recorded answer is returned unchanged instead, and no second
     * audit event is written.
     */
    if (step.decision) {
      if (step.decision === input.decision) return request;
      throw new LifecycleError("CONFLICT", "Tahap ini sudah diputuskan dan tidak dapat diubah.");
    }

    // Past this point a genuinely new decision is being recorded, so the
    // request does have to be waiting for exactly this stage.
    const awaiting = stageAwaiting(request.status);
    if (!awaiting) {
      throw new LifecycleError(
        "CONFLICT",
        `Pengajuan berstatus ${request.status} dan tidak sedang menunggu keputusan.`,
      );
    }
    if (awaiting !== input.stage) {
      throw new LifecycleError(
        "CONFLICT",
        `Pengajuan sedang menunggu tahap ${awaiting}, bukan ${input.stage}.`,
      );
    }
    if (!payloadMatches(request.payload, request.payloadHash)) {
      // Belt and braces: the payload is immutable after submit, so this can
      // only fire if something wrote around the rules. Refusing to execute on
      // an approval given for different text is the whole point of the hash.
      throw new LifecycleError(
        "CONFLICT",
        "Isi pengajuan tidak cocok dengan sidik jari yang disetujui. Pengajuan perlu ditinjau ulang.",
      );
    }

    if (input.decision === "REJECTED" && !input.reason?.trim()) {
      throw new LifecycleError("INVALID", "Alasan penolakan wajib diisi.");
    }

    applyDecision(draft, request, step, input, actor, "PORTAL");
    return request;
  });
}

/**
 * Records a decision and moves the request, whoever authenticated it.
 *
 * Shared between the portal path and the emailed-link path on purpose. The two
 * differ in ONE respect — how the person was authenticated — and everything
 * after that point must be identical: the same transition table, the same
 * revocation of outstanding links, the same audit entry, the same refusal to
 * treat a second approval as completion. Writing it twice is how they drift.
 */
function applyDecision(
  draft: StoreShape,
  request: LifecycleRequest,
  step: ApprovalStep,
  input: DecisionInput,
  actor: ActorIdentity,
  source: AuditEvent["source"],
): void {
  const decidedAt = now();
  step.decision = input.decision;
  step.reason = input.reason?.trim() || undefined;
  step.decidedAt = decidedAt;
  step.decidedBy = actor;

  const next = statusAfterDecision(request.status, input.decision);
  assertTransition(request.status, next);
  request.status = next;
  request.updatedAt = decidedAt;

  if (input.decision === "REJECTED") {
    request.closedAt = decidedAt;
    request.closedReason = step.reason;
  }

  audit(draft, {
    actorId: actor.userId ?? actor.email,
    actorName: actor.name,
    source,
    action: input.decision === "APPROVED" ? "request.approved" : "request.rejected",
    target: request.id,
    correlationId: request.id,
    detail: { stage: input.stage, version: request.version, status: request.status },
  });

  if (input.decision === "REJECTED") {
    // Nothing more will be asked of anybody, so every outstanding link dies
    // with the request rather than staying answerable.
    revokeRequestTokens(draft, request.id, "request-rejected");
    emitResult(draft, request, "REJECTED", step.reason);
  } else if (request.status === "PENDING_CISO") {
    emitApprovalRequest(draft, request, "CISO");
  }

  // The second approval authorises the change; it does not perform it. The
  // request moves into the execution queue and waits for a worker — which is
  // why APPROVED and COMPLETED are different things.
  if (request.status === "APPROVED") {
    const queued = statusAfterApproval(request.effectiveAt, new Date(decidedAt));
    assertTransition(request.status, queued);
    request.status = queued;

    audit(draft, {
      actorId: "system",
      actorName: "HC Portal",
      source: "SYSTEM",
      action: queued === "SCHEDULED" ? "request.scheduled" : "request.queued",
      target: request.id,
      correlationId: request.id,
      detail: { effectiveAt: request.effectiveAt ?? "segera" },
    });

    revokeRequestTokens(draft, request.id, "request-approved");
    emitResult(draft, request, "APPROVED");
  }
}

/* -------------------------------------------------------------------------- */
/* Deciding from an emailed link                                              */
/* -------------------------------------------------------------------------- */

export interface TokenDecisionInput {
  decision: ApprovalDecision;
  reason?: string;
}

const REJECTION_MESSAGE: Record<string, string> = {
  UNKNOWN: "Tautan tidak dikenali.",
  EXPIRED: "Tautan sudah kedaluwarsa. Minta HC mengirim ulang.",
  CONSUMED: "Tautan ini sudah dipakai. Keputusan sebelumnya tetap berlaku.",
  REVOKED: "Tautan sudah tidak berlaku karena pengajuan direvisi, dibatalkan, atau selesai.",
  WRONG_STAGE: "Tautan ini bukan untuk tahap yang sedang menunggu.",
  WRONG_VERSION: "Pengajuan sudah direvisi. Tautan ini menunjuk versi lama.",
};

/**
 * A decision made by somebody holding a link.
 *
 * Be precise about what the token proves: that the holder has a link which was
 * emailed to a specific mailbox, for one stage of one version of one request.
 * It does not prove who they are — mail gets forwarded — which is why the plan
 * pairs it with a validated Microsoft identity, and why this function records
 * the decision against the approver the stage was ADDRESSED to rather than
 * against whoever presented the link.
 *
 * Until Entra validation is wired in, this is the agreed browser fallback and
 * is deliberately no stronger than the link itself.
 *
 * The token is consumed in the same transaction as the decision, so a
 * double-click, a second tab, or a replayed request cannot decide twice.
 */
export async function decideByToken(
  raw: string,
  input: TokenDecisionInput,
): Promise<LifecycleRequest> {
  return mutateStore((draft) => {
    const presented = hashToken(raw);
    const record = draft.approvalTokens.find((candidate) =>
      hashEquals(candidate.tokenHash, presented),
    );

    if (!record) throw new LifecycleError("NOT_FOUND", REJECTION_MESSAGE.UNKNOWN);

    const request = findRequest(draft, record.requestId);

    const check = checkToken(draft.approvalTokens, raw, {
      requestId: record.requestId,
      version: request.version,
      stage: record.stage,
    });

    if (!check.ok) {
      throw new LifecycleError("CONFLICT", REJECTION_MESSAGE[check.reason] ?? "Tautan tidak valid.");
    }

    const awaiting = stageAwaiting(request.status);
    if (awaiting !== record.stage) {
      throw new LifecycleError(
        "CONFLICT",
        `Pengajuan berstatus ${request.status} dan tidak sedang menunggu tahap ${record.stage}.`,
      );
    }

    const step = request.approvals.find(
      (candidate) => candidate.stage === record.stage && candidate.version === request.version,
    );
    if (!step) throw new LifecycleError("CONFLICT", "Tahap persetujuan tidak ditemukan.");
    if (step.decision) {
      throw new LifecycleError("CONFLICT", REJECTION_MESSAGE.CONSUMED);
    }

    if (!payloadMatches(request.payload, request.payloadHash)) {
      throw new LifecycleError(
        "CONFLICT",
        "Isi pengajuan tidak cocok dengan sidik jari yang disetujui.",
      );
    }
    if (input.decision === "REJECTED" && !input.reason?.trim()) {
      throw new LifecycleError("INVALID", "Alasan penolakan wajib diisi.");
    }

    // Consumed here, inside the same transaction as the decision below. If any
    // of it fails, nothing is written and the link is still usable.
    record.consumedAt = now();

    applyDecision(
      draft,
      request,
      step,
      { version: request.version, stage: record.stage, ...input },
      // Credited to the approver the stage was addressed to, not to whoever
      // clicked: the link is evidence of delivery, not of identity.
      step.approver,
      "EMAIL",
    );

    return request;
  });
}

/** What the fallback page may show somebody holding a link. */
export interface TokenPreview {
  requestId: string;
  type: LifecycleType;
  version: number;
  stage: ApprovalStage;
  subjectName: string;
  requesterName: string;
  approverName: string;
  status: LifecycleStatus;
  payload: LifecyclePayload;
  effectiveAt?: string;
  managerDecision?: { by: string; at: string };
}

/**
 * Resolves a link to what it is about, without deciding anything.
 *
 * Opening an email must never change a decision — mail scanners and link
 * previewers follow every URL in a message — so this is a read, and the page it
 * feeds posts separately. Note what it does not return: the token, the payload
 * hash, or anything about other requests.
 */
export async function previewByToken(
  raw: string,
): Promise<{ ok: true; preview: TokenPreview } | { ok: false; reason: string }> {
  const { approvalTokens, lifecycleRequests } = await readStore();

  const presented = hashToken(raw);
  const record = approvalTokens.find((candidate) => hashEquals(candidate.tokenHash, presented));
  if (!record) return { ok: false, reason: REJECTION_MESSAGE.UNKNOWN };

  const request = lifecycleRequests.find((candidate) => candidate.id === record.requestId);
  if (!request) return { ok: false, reason: REJECTION_MESSAGE.UNKNOWN };

  const check = checkToken(approvalTokens, raw, {
    requestId: record.requestId,
    version: request.version,
    stage: record.stage,
  });
  if (!check.ok) return { ok: false, reason: REJECTION_MESSAGE[check.reason] ?? "Tautan tidak valid." };

  const step = request.approvals.find(
    (candidate) => candidate.stage === record.stage && candidate.version === request.version,
  );
  const managerStep = request.approvals.find(
    (candidate) => candidate.stage === "MANAGER" && candidate.version === request.version,
  );

  return {
    ok: true,
    preview: {
      requestId: request.id,
      type: request.type,
      version: request.version,
      stage: record.stage,
      subjectName: request.subject.displayName,
      requesterName: request.requester.name,
      approverName: step?.approver.name ?? "",
      status: request.status,
      payload: request.payload,
      effectiveAt: request.effectiveAt,
      managerDecision:
        record.stage === "CISO" && managerStep?.decidedAt && managerStep.decidedBy
          ? { by: managerStep.decidedBy.name, at: managerStep.decidedAt }
          : undefined,
    },
  };
}

/**
 * Withdraws a request before a worker has claimed it.
 *
 * The state machine stops allowing this at EXECUTING: once a change is being
 * made in the directory, stopping it is an operations problem, and pretending
 * otherwise would let the dashboard claim it had cancelled something that had
 * in fact already happened.
 */
export async function cancelRequest(
  id: string,
  session: PortalSession,
  reason?: string,
): Promise<LifecycleRequest> {
  const actor = identityOf(session);

  return mutateStore((draft) => {
    const request = findRequest(draft, id);

    if (!isSamePerson(request.requester, actor) && !session.roles.includes("SYSTEM_ADMIN")) {
      throw new LifecycleError("FORBIDDEN", "Hanya pemohon yang dapat membatalkan pengajuan ini.");
    }

    assertTransition(request.status, "CANCELLED");

    revokeRequestTokens(draft, request.id, "request-cancelled");

    const at = now();
    request.status = "CANCELLED";
    request.closedAt = at;
    request.closedReason = reason?.trim() || "Dibatalkan oleh pemohon.";
    request.updatedAt = at;

    audit(draft, {
      actorId: actor.userId ?? actor.email,
      actorName: actor.name,
      source: "PORTAL",
      action: "request.cancelled",
      target: request.id,
      correlationId: request.id,
      detail: { reason: request.closedReason },
    });

    return request;
  });
}

/* -------------------------------------------------------------------------- */
/* Retrying a failed execution                                                */
/* -------------------------------------------------------------------------- */

export interface RetryInput {
  /**
   * Set only for a job whose worker vanished. It asserts that a human has
   * compared the directory object against the checkpoints — which no code can
   * verify, so it is recorded in the audit trail as a claim somebody made.
   */
  acknowledgedReconciliation?: boolean;
}

/**
 * Failures a retry cannot fix, because retrying is the wrong response.
 *
 * Both mean the approval no longer describes the situation. Sending the same
 * job again would execute a change nobody agreed to in its current form, so the
 * request has to be raised and approved afresh instead.
 */
const NOT_RETRYABLE: Record<string, string> = {
  DRIFT:
    "Kondisi akun sudah berubah sejak disetujui, jadi mengulang akan menjalankan perubahan yang tidak lagi sesuai. Ajukan ulang agar kedua approver menilai keadaan sekarang.",
  PAYLOAD_MISMATCH:
    "Isi pengajuan tidak cocok dengan yang disetujui. Pengajuan harus ditinjau dan diajukan ulang.",
};

/**
 * Puts a failed execution back in the queue.
 *
 * Eligibility is recomputed here from the stored job, never taken from the
 * caller: a browser saying "this one is safe to retry" is not evidence, and the
 * whole reason a job failed may be the thing the browser cannot see.
 *
 * The checkpoints survive. A retry resumes from the last completed step rather
 * than starting over, which is what stops a half-finished onboarding creating a
 * second account.
 */
export async function retryRequest(
  id: string,
  session: PortalSession,
  input: RetryInput = {},
): Promise<LifecycleRequest> {
  const actor = identityOf(session);

  return mutateStore((draft) => {
    const request = findRequest(draft, id);

    if (request.status !== "FAILED") {
      throw new LifecycleError(
        "CONFLICT",
        `Hanya pengajuan berstatus FAILED yang dapat dicoba lagi; ini berstatus ${request.status}.`,
      );
    }

    const job = draft.executionJobs.find(
      (candidate) => candidate.operationId === `${request.id}:${request.version}`,
    );

    const blocked = job?.errorCode ? NOT_RETRYABLE[job.errorCode] : undefined;
    if (blocked) throw new LifecycleError("CONFLICT", blocked);

    if (job?.errorCode === "LEASE_EXPIRED" && !input.acknowledgedReconciliation) {
      throw new LifecycleError(
        "CONFLICT",
        "Worker sebelumnya berhenti tanpa melapor. Bandingkan objek direktori dengan checkpoint lebih dulu, lalu ulangi dengan konfirmasi rekonsiliasi.",
      );
    }

    assertTransition(request.status, "QUEUED");

    /*
     * Captured before the job is reset, not after.
     *
     * The whole purpose of the audit entry below is to record what this retry
     * was retrying from; reading it after clearing the error wrote "-" every
     * time, leaving a trail that says somebody retried something and not what.
     */
    const previousError = job?.errorCode ?? "-";
    const previousAttempt = job?.attempt ?? 0;

    const at = now();
    request.status = "QUEUED";
    request.updatedAt = at;

    if (job) {
      // The error is cleared so the screen stops showing a failure that is no
      // longer the current state. The steps are not: they are what makes the
      // retry resume instead of restart.
      job.state = "CLAIMED";
      job.errorCode = undefined;
      job.errorMessage = undefined;
      job.finishedAt = undefined;
      job.leaseWorkerId = undefined;
      job.leaseExpiresAt = undefined;
      job.updatedAt = at;
    }

    audit(draft, {
      actorId: actor.userId ?? actor.email,
      actorName: actor.name,
      source: "PORTAL",
      action: "execution.retry_requested",
      target: request.id,
      correlationId: request.id,
      detail: {
        previousError,
        attempt: previousAttempt,
        reconciliationAcknowledged: Boolean(input.acknowledgedReconciliation),
      },
    });

    return request;
  });
}

/**
 * Replaces the payload with a new version and sends the request back to draft.
 *
 * Approvals are dropped rather than carried over, because they were given for
 * text that no longer exists. Anything already approved is past the point where
 * this is allowed — the state machine refuses it — since there is an authorised
 * change waiting to run and editing it would execute something nobody agreed to.
 */
export async function reviseRequest(
  id: string,
  payload: LifecyclePayload,
  session: PortalSession,
  effectiveAt?: string,
): Promise<LifecycleRequest> {
  const actor = identityOf(session);

  return mutateStore((draft) => {
    const request = findRequest(draft, id);

    if (!isSamePerson(request.requester, actor)) {
      throw new LifecycleError("FORBIDDEN", "Hanya pemohon yang dapat merevisi pengajuan ini.");
    }
    if (typeOf(payload) !== request.type) {
      throw new LifecycleError("INVALID", "Revisi tidak boleh mengubah jenis pengajuan.");
    }

    assertTransition(request.status, "DRAFT");

    /*
     * Every link issued for the previous version dies here.
     *
     * This is the case the token's version binding exists for, checked twice on
     * purpose: an approver holding an old email must not be able to approve
     * text that has since been replaced.
     */
    revokeRequestTokens(draft, request.id, "request-revised");

    const previous: ApprovalStep[] = request.approvals;
    const at = now();

    request.version += 1;
    request.status = "DRAFT";
    request.payload = payload;
    request.payloadHash = "";
    request.approvals = [];
    request.effectiveAt = effectiveAt;
    request.submittedAt = undefined;
    request.updatedAt = at;

    audit(draft, {
      actorId: actor.userId ?? actor.email,
      actorName: actor.name,
      source: "PORTAL",
      action: "request.revised",
      target: request.id,
      correlationId: request.id,
      detail: {
        version: request.version,
        // Recorded so the trail shows what was thrown away, not just that
        // something was.
        approvalsVoided: previous.filter((step) => step.decision).length,
      },
    });

    return request;
  });
}
