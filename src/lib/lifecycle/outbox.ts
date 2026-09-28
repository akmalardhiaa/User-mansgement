import { randomUUID } from "node:crypto";

import type { StoreShape } from "@/lib/db/store";

import { issueToken, revokeTokens } from "./approvalToken";
import { seal } from "./outboxCrypto";
import { INTERNAL_PROFILE_FIELDS, REDACTED_VALUE } from "./profileUpdate";
import { answerersOf } from "./routing";
import type { OutboxEvent, OutboxKind } from "./outboxTypes";
import type { ApprovalStage, LifecyclePayload, LifecycleRequest, LifecycleType } from "./types";

/**
 * Emitting the emails a state change owes.
 *
 * Every function here takes the store draft rather than opening its own write,
 * and that is the whole point: the obligation to send is committed in the SAME
 * transaction as the decision that created it. Send inside the transaction and
 * a slow provider holds a lock while a crash after sending loses the record;
 * send after committing and a crash in between loses the obligation entirely,
 * leaving a request waiting on somebody who was never told.
 *
 * Committing a row instead costs a delay at worst.
 */

/** What the renderer needs. Sealed, because for an approval it carries the token. */
export interface ApprovalMailPayload {
  kind: OutboxKind;
  /** The raw approval token. Present only on `approval.request`. */
  token?: string;
  requestId: string;
  version: number;
  type: LifecycleType;
  stage?: ApprovalStage;
  subjectName: string;
  requesterName: string;
  approverName: string;
  /** How many people this stage was sent to, when it went to a team. */
  teamSize?: number;
  effectiveAt?: string;
  /**
   * The request itself, so an approver can judge it from the message rather
   * than being asked to decide on a summary and a link.
   *
   * Optional because a message queued before this field existed has none, and a
   * dispatcher working through the backlog must still be able to render it.
   */
  payload?: LifecyclePayload;
  /** Shown to the CISO: the manager has already answered, and when. */
  managerDecision?: { by: string; at: string };
  /** For a result email — approved, rejected, and why. */
  outcome?: string;
  reason?: string;
}

function push(
  draft: StoreShape,
  event: Omit<OutboxEvent, "eventId" | "state" | "attempt" | "createdAt" | "updatedAt">,
  at: string,
): OutboxEvent {
  const created: OutboxEvent = {
    eventId: `out_${randomUUID()}`,
    state: "PENDING",
    attempt: 0,
    createdAt: at,
    updatedAt: at,
    ...event,
  };
  draft.outboxEvents.push(created);
  return created;
}

/**
 * The payload minus anything that must not travel in an email.
 *
 * Only the termination note today. It is an internal HC record of why somebody
 * is leaving, it is not part of what an approver needs in order to decide, and
 * the plan is explicit that those circumstances travel no further than they
 * must.
 *
 * Dropped HERE rather than in the renderer, deliberately. If the renderer were
 * the only thing keeping it out, the note would still be sitting in the queued
 * message, one careless template change away from an inbox. Removing it at the
 * boundary means it never enters the mail path at all.
 *
 * Written as an allow list rather than by discarding `note`, which matters more
 * than it looks: a sensitive field added to TerminationPayload later stays out
 * by default and has to be named to travel. Excluding by omission puts the
 * burden on whoever adds the field to remember; this way forgetting is safe.
 */
export function mailSafePayload(payload: LifecyclePayload): LifecyclePayload {
  if (payload.kind === "PROFILE_UPDATE") {
    /*
     * The HC note stays in the portal. The approver still sees THAT it changed —
     * a change hidden from the approver is a change nobody approved — but its
     * content is replaced before it ever reaches the queue, and the full target
     * profile is dropped entirely: the changes are what is being decided.
     */
    const internal = new Set<string>(INTERNAL_PROFILE_FIELDS);
    return {
      kind: payload.kind,
      employeeId: payload.employeeId,
      profile: {
        firstName: payload.profile.firstName,
        lastName: payload.profile.lastName,
        displayName: payload.profile.displayName,
        jobTitle: payload.profile.jobTitle,
        department: payload.profile.department,
      },
      changes: payload.changes.map((change) =>
        internal.has(change.field)
          ? { field: change.field, label: change.label, from: "—", to: REDACTED_VALUE }
          : change,
      ),
    };
  }

  if (payload.kind !== "TERMINATION") return payload;

  return {
    kind: payload.kind,
    employeeId: payload.employeeId,
    reasonCategory: payload.reasonCategory,
    lastWorkingDate: payload.lastWorkingDate,
    handoverTo: payload.handoverTo,
  };
}

/**
 * Asks an approver — or every member of an approving team — to decide.
 *
 * Each person gets their own message and their own single-use link, bound to
 * their address. A shared link sent to a distribution list would be cheaper,
 * and it would make the audit trail unable to say who approved, let anybody the
 * message was forwarded to decide, and give no way to leave out a member who is
 * party to the request. Per-person links answer all three.
 *
 * The raw token exists in exactly two places from here: this sealed payload,
 * and the email once it is rendered. It is deleted from the payload the moment
 * the message is accepted.
 */
export function emitApprovalRequest(
  draft: StoreShape,
  request: LifecycleRequest,
  stage: ApprovalStage,
  now = new Date(),
): OutboxEvent[] {
  const step = request.approvals.find(
    (candidate) => candidate.stage === stage && candidate.version === request.version,
  );
  if (!step) return [];

  const managerStep =
    stage === "CISO"
      ? request.approvals.find(
          (candidate) => candidate.stage === "MANAGER" && candidate.version === request.version,
        )
      : undefined;

  const members = answerersOf(step);
  const at = now.toISOString();

  return members.map((member) => {
    const issued = issueToken(request.id, request.version, stage, now, member.email);
    draft.approvalTokens.push(issued.record);

    const payload: ApprovalMailPayload = {
      kind: "approval.request",
      token: issued.raw,
      requestId: request.id,
      version: request.version,
      type: request.type,
      stage,
      subjectName: request.subject.displayName,
      requesterName: request.requester.name,
      approverName: member.name,
      teamSize: members.length > 1 ? members.length : undefined,
      effectiveAt: request.effectiveAt,
      payload: mailSafePayload(request.payload),
      managerDecision:
        managerStep?.decidedAt && managerStep.decidedBy
          ? { by: managerStep.decidedBy.name, at: managerStep.decidedAt }
          : undefined,
    };

    return push(
      draft,
      {
        kind: "approval.request",
        aggregateId: request.id,
        version: request.version,
        stage,
        recipient: member.email,
        sealedPayload: seal(JSON.stringify(payload)),
        // Due immediately. The dispatcher decides when it actually runs.
        nextAttemptAt: at,
      },
      at,
    );
  });
}

/**
 * Tells the requester how it ended.
 *
 * Sealed like an approval request even though it carries no token: a rejection
 * reason is somebody's business and not worth leaving in the clear in a queue,
 * and one code path is easier to keep honest than two.
 */
export function emitResult(
  draft: StoreShape,
  request: LifecycleRequest,
  outcome: string,
  reason?: string,
  now = new Date(),
): OutboxEvent {
  const kind: OutboxKind = outcome === "REJECTED" ? "request.rejected" : "approval.result";

  const payload: ApprovalMailPayload = {
    kind,
    requestId: request.id,
    version: request.version,
    type: request.type,
    subjectName: request.subject.displayName,
    requesterName: request.requester.name,
    approverName: "",
    outcome,
    reason,
  };

  const at = now.toISOString();
  return push(
    draft,
    {
      kind,
      aggregateId: request.id,
      version: request.version,
      recipient: request.requester.email,
      sealedPayload: seal(JSON.stringify(payload)),
      nextAttemptAt: at,
    },
    at,
  );
}

/**
 * Kills every live link for a request.
 *
 * Called on revision, rejection, approval and cancellation. Revision is the one
 * that matters most: the old links were issued for text that no longer exists,
 * and leaving them usable would let somebody approve a version nobody is asking
 * about any more.
 */
export function revokeRequestTokens(
  draft: StoreShape,
  requestId: string,
  reason: string,
  now = new Date(),
): number {
  return revokeTokens(draft.approvalTokens, requestId, reason, now);
}
