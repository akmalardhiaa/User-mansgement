import type { ApprovalDecision, ApprovalStage, LifecycleStatus } from "./types";

/**
 * The only transitions that exist.
 *
 * Everything that moves a request reads this table. Writing the rule down once,
 * as data, is what makes "can this go from here to there?" answerable by a test
 * instead of by reading every call site — and it is what stops a new feature
 * quietly inventing a path from PENDING_MANAGER straight to COMPLETED.
 */
const TRANSITIONS: Record<LifecycleStatus, readonly LifecycleStatus[]> = {
  // HC is still editing. Cancelling a draft simply throws it away.
  DRAFT: ["PENDING_MANAGER", "CANCELLED"],

  // Back to DRAFT is a revision. Editing a request that is already out for
  // approval must not mutate it in place, because somebody may have already
  // read the old text — so a revision sends it back to the start with a new
  // version, and the approvals given for the previous one stop counting.
  PENDING_MANAGER: ["PENDING_CISO", "REJECTED", "CANCELLED", "EXPIRED", "DRAFT"],
  PENDING_CISO: ["APPROVED", "REJECTED", "CANCELLED", "EXPIRED", "DRAFT"],

  // Approved but not yet done. Which way it goes depends on whether an
  // effective date is still in the future.
  APPROVED: ["SCHEDULED", "QUEUED", "CANCELLED"],
  SCHEDULED: ["QUEUED", "CANCELLED", "EXPIRED"],

  // Cancellable right up to the moment a worker claims it, and not after: once
  // a change is being made in the directory, stopping it is an operations
  // problem, not a state transition.
  QUEUED: ["EXECUTING", "CANCELLED"],
  EXECUTING: ["COMPLETED", "FAILED"],

  // A retry goes back to the queue, but only after somebody has classified the
  // failure and reconciled what actually happened in the directory.
  FAILED: ["QUEUED"],

  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export const TERMINAL_STATUSES = ["COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"] as const;

export function isTerminal(status: LifecycleStatus): boolean {
  return (TERMINAL_STATUSES as readonly LifecycleStatus[]).includes(status);
}

/** True while a request is waiting on somebody's decision. */
export function isAwaitingDecision(status: LifecycleStatus): boolean {
  return status === "PENDING_MANAGER" || status === "PENDING_CISO";
}

/**
 * True while a request still counts against "one active request per employee".
 *
 * Anything not terminal holds the employee: a second request raised while the
 * first is mid-flight would have two approved payloads racing to change the
 * same account.
 */
export function isActive(status: LifecycleStatus): boolean {
  return !isTerminal(status);
}

export function canTransition(from: LifecycleStatus, to: LifecycleStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class LifecycleTransitionError extends Error {
  constructor(
    readonly from: LifecycleStatus,
    readonly to: LifecycleStatus,
  ) {
    super(`Perubahan status dari ${from} ke ${to} tidak diizinkan.`);
    this.name = "LifecycleTransitionError";
  }
}

export function assertTransition(from: LifecycleStatus, to: LifecycleStatus): void {
  if (!canTransition(from, to)) throw new LifecycleTransitionError(from, to);
}

/** Which approval a request in this status is waiting for, if any. */
export function stageAwaiting(status: LifecycleStatus): ApprovalStage | undefined {
  if (status === "PENDING_MANAGER") return "MANAGER";
  if (status === "PENDING_CISO") return "CISO";
  return undefined;
}

/** The status a request in `status` reaches when `stage` answers `decision`. */
export function statusAfterDecision(
  status: LifecycleStatus,
  decision: ApprovalDecision,
): LifecycleStatus {
  if (decision === "REJECTED") return "REJECTED";
  if (status === "PENDING_MANAGER") return "PENDING_CISO";
  if (status === "PENDING_CISO") return "APPROVED";
  throw new Error(`Status ${status} tidak menunggu keputusan.`);
}

/**
 * Where an approved request goes next.
 *
 * A future effective date parks it; anything else queues it immediately. A date
 * already in the past queues it too — the plan flags a late request as needing
 * a marker rather than silently refusing to run, and refusing here would strand
 * a request nobody can rescue.
 */
export function statusAfterApproval(effectiveAt: string | undefined, now: Date): LifecycleStatus {
  if (!effectiveAt) return "QUEUED";
  return Date.parse(effectiveAt) > now.getTime() ? "SCHEDULED" : "QUEUED";
}
