import { randomUUID } from "node:crypto";

import type { StoreShape } from "@/lib/db/store";

import { issueToken, revokeTokens } from "./approvalToken";
import { seal } from "./outboxCrypto";
import type { OutboxEvent, OutboxKind } from "./outboxTypes";
import type { ApprovalStage, LifecycleRequest, LifecycleType } from "./types";

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
  effectiveAt?: string;
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
 * Asks an approver to decide.
 *
 * Issues the single-use link, records its hash, and seals the raw value into
 * the queued message. The raw token exists in exactly two places from here: this
 * sealed payload, and the email once it is rendered. It is deleted from the
 * payload the moment the message is accepted.
 */
export function emitApprovalRequest(
  draft: StoreShape,
  request: LifecycleRequest,
  stage: ApprovalStage,
  now = new Date(),
): OutboxEvent | undefined {
  const step = request.approvals.find(
    (candidate) => candidate.stage === stage && candidate.version === request.version,
  );
  if (!step) return undefined;

  const issued = issueToken(request.id, request.version, stage, now);
  draft.approvalTokens.push(issued.record);

  const managerStep =
    stage === "CISO"
      ? request.approvals.find(
          (candidate) => candidate.stage === "MANAGER" && candidate.version === request.version,
        )
      : undefined;

  const payload: ApprovalMailPayload = {
    kind: "approval.request",
    token: issued.raw,
    requestId: request.id,
    version: request.version,
    type: request.type,
    stage,
    subjectName: request.subject.displayName,
    requesterName: request.requester.name,
    approverName: step.approver.name,
    effectiveAt: request.effectiveAt,
    managerDecision:
      managerStep?.decidedAt && managerStep.decidedBy
        ? { by: managerStep.decidedBy.name, at: managerStep.decidedAt }
        : undefined,
  };

  const at = now.toISOString();
  return push(
    draft,
    {
      kind: "approval.request",
      aggregateId: request.id,
      version: request.version,
      stage,
      recipient: step.approver.email,
      sealedPayload: seal(JSON.stringify(payload)),
      // Due immediately. The dispatcher decides when it actually runs.
      nextAttemptAt: at,
    },
    at,
  );
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
