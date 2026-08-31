/**
 * Core domain model for the HC User Management dashboard.
 *
 * Both kinds of access request run through the same two-step chain — HC raises
 * it, the manager approves in Jira, IT Security carries it out in Jira:
 *
 *   Adding an account (ONBOARDING)
 *     PENDING_MANAGER_APPROVAL -> PENDING_SECURITY_SETUP -> ACTIVE
 *
 *   Removing an account (OFFBOARDING)
 *     PENDING_REMOVAL_APPROVAL -> PENDING_REMOVAL_SETUP  -> REMOVED
 *
 * A manager rejection ends the request: a rejected joiner becomes REJECTED,
 * while a rejected removal simply restores the employee's previous status.
 *
 * REMOVED means access was revoked, not that the record was deleted — HC needs
 * the history. DISABLED is separate and deliberately unmediated: a reversible
 * suspension HC can apply immediately without waiting on an approval.
 */

export const EMPLOYEE_STATUSES = [
  "PENDING_MANAGER_APPROVAL",
  "PENDING_SECURITY_SETUP",
  "ACTIVE",
  "DISABLED",
  "REJECTED",
  "PENDING_REMOVAL_APPROVAL",
  "PENDING_REMOVAL_SETUP",
  "REMOVED",
] as const;

export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export interface Employee {
  id: string;
  name: string;
  email: string;
  jobTitle: string;
  department: string;
  managerName: string;
  /** Work email of the manager. Resolved to a Jira account so ticket #1 is assigned. */
  managerEmail: string;
  /** Jira accountId, once resolved. Assignment is what makes Jira email them. */
  managerAccountId?: string;
  status: EmployeeStatus;
  /** The access request currently acting on this employee, if any. */
  activeRequestId?: string;
  createdAt: string;
  updatedAt: string;
}

/** What the request asks for. Both types share the same approval chain. */
export const REQUEST_TYPES = ["ONBOARDING", "OFFBOARDING"] as const;

export type RequestType = (typeof REQUEST_TYPES)[number];

/** Where an in-flight request currently sits in the approval chain. */
export const REQUEST_STAGES = [
  "MANAGER_APPROVAL",
  "SECURITY_PROVISIONING",
  "COMPLETED",
  "REJECTED",
] as const;

export type RequestStage = (typeof REQUEST_STAGES)[number];

export interface WorkflowEvent {
  at: string;
  /** Machine-readable event name, e.g. "manager.approved". */
  type: string;
  /** Human-readable line rendered in the audit trail. */
  message: string;
  /** Who caused it — a Jira display name, or "HC Portal" for local actions. */
  actor?: string;
  issueKey?: string;
}

export interface JiraIssueRef {
  key: string;
  url: string;
  /** Last status name we observed for this issue. */
  status?: string;
  /**
   * Who the issue is assigned to. Assignment is what makes Jira email them, so
   * an absent value means nobody was notified.
   */
  assignee?: string;
}

export interface AccessRequest {
  id: string;
  employeeId: string;
  type: RequestType;
  stage: RequestStage;
  /** Why the removal was asked for. Offboarding only. */
  reason?: string;
  /**
   * Status to restore if a removal is rejected — an employee whose offboarding
   * the manager turns down should go back to working normally, not to REJECTED.
   */
  previousStatus?: EmployeeStatus;
  managerIssue?: JiraIssueRef;
  securityIssue?: JiraIssueRef;
  events: WorkflowEvent[];
  /**
   * Transitions already applied, as `${issueKey}:${status}`. Jira delivers
   * webhooks at-least-once, so we claim a signal before acting on it.
   */
  processedSignals: string[];
  createdAt: string;
  updatedAt: string;
}

/** Payload accepted by `POST /api/users`. */
export interface NewUserInput {
  name: string;
  email: string;
  jobTitle: string;
  department: string;
  managerName: string;
  managerEmail: string;
  /** Optional override; normally resolved from `managerEmail`. */
  managerAccountId?: string;
}
