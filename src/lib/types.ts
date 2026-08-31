/**
 * Core domain model for the HC User Management dashboard.
 *
 * Both kinds of access request run through the same two-step chain — HC raises
 * it, the manager approves in Jira, IT Security carries it out in Jira:
 *
 *   Adding an account (ONBOARDING)
 *     PENDING_MANAGER_APPROVAL -> PENDING_SECURITY_SETUP -> ACTIVE
 *
 *   Moving between divisions (TRANSFER)
 *     PENDING_TRANSFER_APPROVAL -> PENDING_TRANSFER_SETUP -> back to ACTIVE,
 *     with the new department, position and manager applied.
 *
 * A manager rejection ends the request: a rejected joiner becomes REJECTED,
 * while a rejected transfer simply restores the employee's previous status and
 * leaves their position untouched.
 *
 * DISABLED is separate and deliberately unmediated: a reversible suspension HC
 * can apply immediately without waiting on an approval.
 */

export const EMPLOYEE_STATUSES = [
  "PENDING_MANAGER_APPROVAL",
  "PENDING_SECURITY_SETUP",
  "ACTIVE",
  "DISABLED",
  "REJECTED",
  "PENDING_TRANSFER_APPROVAL",
  "PENDING_TRANSFER_SETUP",
] as const;

export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export interface Employee {
  id: string;
  /** Given name — Active Directory `givenName`. */
  firstName: string;
  /** Surname — Active Directory `sn`. */
  lastName: string;
  /** How the person is shown in lists and directories — AD `displayName`. */
  displayName: string;
  /** Formal full name used on tickets and records — AD `cn`. */
  fullName: string;
  email: string;
  jobTitle: string;
  department: string;
  managerName: string;
  /** Work email of the manager. Resolved to a Jira account so ticket #1 is assigned. */
  managerEmail: string;
  /** Jira accountId, once resolved. Assignment is what makes Jira email them. */
  managerAccountId?: string;
  /** Free-text note HC captured when the account was requested. */
  description?: string;
  status: EmployeeStatus;
  /** The access request currently acting on this employee, if any. */
  activeRequestId?: string;
  createdAt: string;
  updatedAt: string;
}

/** What the request asks for. Both types share the same approval chain. */
export const REQUEST_TYPES = ["ONBOARDING", "TRANSFER"] as const;

export type RequestType = (typeof REQUEST_TYPES)[number];

/** Where an in-flight request currently sits in the approval chain. */
export const REQUEST_STAGES = [
  "MANAGER_APPROVAL",
  "SECURITY_PROVISIONING",
  "COMPLETED",
  "REJECTED",
] as const;

export type RequestStage = (typeof REQUEST_STAGES)[number];

/** The position an employee is moving into. */
export interface TransferTarget {
  department: string;
  jobTitle: string;
  /** Optional: a move between divisions usually means a new manager too. */
  managerName?: string;
  managerEmail?: string;
}

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
  /** Why HC raised the request. Transfers only. */
  reason?: string;
  /** Where the employee is moving to. Transfers only. */
  transfer?: TransferTarget;
  /**
   * Status to restore if a transfer is rejected — an employee whose move the
   * manager turns down keeps working where they are, not becoming REJECTED.
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
  firstName: string;
  lastName: string;
  displayName: string;
  fullName: string;
  email: string;
  jobTitle: string;
  department: string;
  managerName: string;
  managerEmail: string;
  /** Free-text note carried onto both Jira tickets. */
  description?: string;
  /** Optional override; normally resolved from `managerEmail`. */
  managerAccountId?: string;
}

/** Payload accepted by `POST /api/users/:id/transfer`. */
export interface TransferInput extends TransferTarget {
  reason?: string;
}
