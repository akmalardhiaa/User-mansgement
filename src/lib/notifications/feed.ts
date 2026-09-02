import type { AccessRequest, Employee, WorkflowEvent } from "@/lib/types";

/**
 * The notification feed.
 *
 * Two questions get asked of this dashboard between visits: what is still
 * waiting on someone, and what moved while I was away. Both are already in the
 * store — a request's stage answers the first, its audit trail the second — so
 * this derives the feed rather than recording notifications of its own. Nothing
 * to keep in sync, and no way for a delivered notification to contradict the
 * request it describes.
 *
 * Kept pure and free of React so the API route and any future digest can share
 * it, in the same spirit as `lib/dashboard/directory`.
 */

export type FeedKind = "pending" | "advanced" | "rejected";

export interface FeedItem {
  /** Stable across refetches, so the client can track what has been seen. */
  id: string;
  kind: FeedKind;
  /** One line naming the person and what is happening to them. */
  title: string;
  /** The supporting sentence; for advances, the audit trail's own wording. */
  detail: string;
  /** ISO timestamp this is sorted and marked-as-read by. */
  at: string;
  requestId: string;
  employeeId: string;
  issueKey?: string;
  issueUrl?: string;
}

export interface Feed {
  items: FeedItem[];
  /** How many requests are waiting on somebody right now. */
  pending: number;
}

/**
 * Audit events worth surfacing, and how to headline each.
 *
 * The trail also records `request.created` and the `notify.*` pair. Those are
 * HC's own actions and Jira plumbing respectively — an officer who just filed a
 * request does not need telling that they filed it, so neither is a
 * notification.
 */
const ADVANCE_HEADLINES: Record<string, string> = {
  "manager.approved": "Disetujui manager",
  "security.requested": "Diteruskan ke IT Security",
  "security.completed": "Penyiapan akses selesai",
  "manager.rejected": "Ditolak manager",
};

function pendingHeadline(request: AccessRequest): string | undefined {
  const moving = request.type === "TRANSFER";
  if (request.stage === "MANAGER_APPROVAL") {
    return moving ? "Pindah divisi — menunggu manager" : "Menunggu persetujuan manager";
  }
  if (request.stage === "SECURITY_PROVISIONING") {
    return moving ? "Pindah divisi — menunggu IT Security" : "Menunggu penyiapan IT Security";
  }
  return undefined;
}

/** The ticket an event belongs to, so the item can deep-link into Jira. */
function issueFor(request: AccessRequest, event: WorkflowEvent) {
  if (!event.issueKey) return undefined;
  for (const issue of [request.managerIssue, request.securityIssue]) {
    if (issue?.key === event.issueKey) return issue;
  }
  return undefined;
}

function nameOf(employees: Map<string, Employee>, employeeId: string): string {
  return employees.get(employeeId)?.displayName ?? "Karyawan";
}

export function buildFeed(requests: AccessRequest[], employees: Employee[]): Feed {
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  const items: FeedItem[] = [];
  let pending = 0;

  for (const request of requests) {
    const who = nameOf(byId, request.employeeId);

    const waiting = pendingHeadline(request);
    if (waiting) {
      pending += 1;
      const issue =
        request.stage === "MANAGER_APPROVAL" ? request.managerIssue : request.securityIssue;
      items.push({
        id: `${request.id}:pending:${request.stage}`,
        kind: "pending",
        title: `${who} — ${waiting}`,
        detail: issue
          ? `Tiket ${issue.key}${issue.assignee ? ` di-assign ke ${issue.assignee}` : " belum di-assign"}.`
          : "Belum ada tiket Jira untuk tahap ini.",
        // The stage's own age, not the request's: an item that has sat in one
        // stage for a week should not look fresh because something else about
        // the request changed.
        at: request.updatedAt,
        requestId: request.id,
        employeeId: request.employeeId,
        issueKey: issue?.key,
        issueUrl: issue?.url,
      });
    }

    for (const event of request.events) {
      const headline = ADVANCE_HEADLINES[event.type];
      if (!headline) continue;
      const issue = issueFor(request, event);
      items.push({
        id: `${request.id}:${event.type}:${event.at}`,
        kind: event.type === "manager.rejected" ? "rejected" : "advanced",
        title: `${who} — ${headline}`,
        detail: event.message,
        at: event.at,
        requestId: request.id,
        employeeId: request.employeeId,
        issueKey: event.issueKey,
        issueUrl: issue?.url,
      });
    }
  }

  items.sort((a, b) => b.at.localeCompare(a.at));
  return { items, pending };
}

/**
 * Items newer than the last time the panel was opened.
 *
 * A timestamp rather than a set of seen ids: pending items keep the same id
 * across refetches but move their timestamp forward as the request is touched,
 * and an id-based reading would mark those permanently read the first time they
 * appeared. An empty or unparseable mark means everything is new, which is the
 * right answer on a first visit and a safe one after storage is cleared.
 */
export function unreadSince(items: FeedItem[], lastSeen: string | null): FeedItem[] {
  if (!lastSeen) return items;
  return items.filter((item) => item.at > lastSeen);
}
