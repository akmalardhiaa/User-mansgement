/**
 * Core domain model for the HC User Management dashboard.
 *
 * The lifecycle of a new joiner is:
 *
 *   HC submits form
 *     -> PENDING_MANAGER_APPROVAL   (Jira ticket #1 assigned to the manager)
 *     -> PENDING_SECURITY_SETUP     (Jira ticket #2 assigned to IT Security)
 *     -> ACTIVE                     (security ticket closed)
 *
 * A manager rejection short-circuits the flow to REJECTED, and HC can always
 * flip an ACTIVE employee to DISABLED (and back) from the dashboard.
 */

export const EMPLOYEE_STATUSES = [
  "PENDING_MANAGER_APPROVAL",
  "PENDING_SECURITY_SETUP",
  "ACTIVE",
  "DISABLED",
  "REJECTED",
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
  /** Links back to the onboarding request that created this record, if any. */
  onboardingRequestId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Where an in-flight onboarding request currently sits in the approval chain. */
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

export interface OnboardingRequest {
  id: string;
  employeeId: string;
  stage: RequestStage;
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
