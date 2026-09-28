import { stageAwaiting } from "./stateMachine";
import type { ApprovalStage, LifecycleRequest, LifecycleType } from "./types";

/**
 * What HC needs to notice, for the bell in the header.
 *
 * The bell used to list requests waiting for the signed-in person's own
 * approval — a question nobody who can sign in here is ever asked. Managers
 * and the CISO team decide from email and have no portal access at all, so it
 * was empty for every user, always. HC's version of the same question is the
 * mirror image: what came back, and what nobody has answered yet.
 *
 * Kept out of the route because these are rules, not plumbing: how long an
 * approval may sit before somebody should chase it is a decision, and it is
 * worth reading — and testing — without a request object around it.
 */

export const NOTIFICATION_KINDS = [
  /** Execution failed. The account was not changed. */
  "FAILED",
  /** Submitted, still unanswered. Somebody needs a nudge. */
  "WAITING_TOO_LONG",
  /** An approver said no; the reason is on the request. */
  "REJECTED",
  /** Done. News rather than work, and it drops off by itself. */
  "COMPLETED",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** The two that mean somebody still has something to do. */
const NEEDS_ATTENTION: readonly NotificationKind[] = ["FAILED", "WAITING_TOO_LONG"];

const HOUR_MS = 60 * 60 * 1000;

/**
 * An approval is only late once a working day has passed. Anything shorter
 * reports every fresh submission as overdue, and a badge that is always lit
 * tells nobody anything.
 */
export const WAITING_LATE_AFTER_HOURS = 24;

/** How long a finished request stays worth mentioning. */
const RECENT_WINDOW_HOURS: Record<"REJECTED" | "COMPLETED", number> = {
  REJECTED: 72,
  COMPLETED: 48,
};

/** Most urgent first, so the top of the panel is the part worth reading. */
const KIND_ORDER: Record<NotificationKind, number> = {
  FAILED: 0,
  WAITING_TOO_LONG: 1,
  REJECTED: 2,
  COMPLETED: 3,
};

/** Enough to show the shape of a backlog without a scrollbar to nowhere. */
const MAX_ITEMS = 12;

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  type: LifecycleType;
  subjectName: string;
  department: string;
  /** The moment this is about: when it failed, was decided, or was submitted. */
  at: string;
  /** Whole hours waited, on WAITING_TOO_LONG only. */
  waitingHours?: number;
  /** Which approval is outstanding, on WAITING_TOO_LONG only. */
  stage?: ApprovalStage;
}

export interface NotificationFeed {
  items: NotificationItem[];
  total: number;
  /**
   * What the badge counts. The rest is news: lighting a badge for work that is
   * already done trains people to ignore it.
   */
  needsAttention: number;
}

function classify(request: LifecycleRequest, now: number): NotificationItem | undefined {
  const base = {
    id: request.id,
    type: request.type,
    subjectName: request.subject.displayName,
    department: request.subject.department ?? "",
  };

  if (request.status === "FAILED") {
    return { ...base, kind: "FAILED", at: request.updatedAt };
  }

  const awaiting = stageAwaiting(request.status);
  if (awaiting) {
    /*
     * Measured from updatedAt, not createdAt. A revision restarts the wait: the
     * approver of record is only late relative to the version they were
     * actually sent, and a request revised twice is not three days overdue
     * because the first draft was raised three days ago.
     */
    const waited = now - Date.parse(request.updatedAt);
    if (!Number.isFinite(waited) || waited < WAITING_LATE_AFTER_HOURS * HOUR_MS) return undefined;
    return {
      ...base,
      kind: "WAITING_TOO_LONG",
      at: request.updatedAt,
      waitingHours: Math.floor(waited / HOUR_MS),
      stage: awaiting,
    };
  }

  if (request.status === "REJECTED" || request.status === "COMPLETED") {
    const age = now - Date.parse(request.updatedAt);
    if (!Number.isFinite(age) || age > RECENT_WINDOW_HOURS[request.status] * HOUR_MS) {
      return undefined;
    }
    return { ...base, kind: request.status, at: request.updatedAt };
  }

  return undefined;
}

/** The feed, from whatever requests the caller is allowed to see. */
export function notificationsFor(
  requests: readonly LifecycleRequest[],
  now = Date.now(),
): NotificationFeed {
  const items = requests
    .map((request) => classify(request, now))
    .filter((item): item is NotificationItem => item !== undefined)
    // Oldest first inside a kind: the one that has waited longest is the one
    // somebody should chase first.
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.at.localeCompare(b.at))
    .slice(0, MAX_ITEMS);

  return {
    items,
    total: items.length,
    needsAttention: items.filter((item) => NEEDS_ATTENTION.includes(item.kind)).length,
  };
}
