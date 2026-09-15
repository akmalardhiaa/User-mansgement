/**
 * Core domain model for the HC User Management dashboard.
 *
 * All three kinds of access request run through the same two-step chain — HC
 * raises it, the manager approves by email, and IT Security confirms the work by email:
 *
 *   Adding an account (ONBOARDING)
 *     PENDING_MANAGER_APPROVAL -> PENDING_SECURITY_SETUP -> ACTIVE
 *
 *   Moving between divisions (TRANSFER)
 *     PENDING_TRANSFER_APPROVAL -> PENDING_TRANSFER_SETUP -> back to ACTIVE,
 *     with the new department, position and manager applied.
 *
 *   Removing an account (OFFBOARDING)
 *     PENDING_OFFBOARDING_APPROVAL -> PENDING_OFFBOARDING_SETUP -> DISABLED,
 *     once IT Security has revoked the access.
 *
 * A manager rejection ends the request: a rejected joiner becomes REJECTED,
 * while a rejected transfer simply restores the employee's previous status and
 * leaves their position untouched. A rejected offboarding leaves the employee
 * exactly as they were — still active, still with their access.
 *
 * DISABLED is where an approved offboarding ends up, and it is also what HC
 * applies directly as a reversible suspension that needs no approval. Keeping
 * one status for both is deliberate: in either case the person keeps their
 * record and their history, and can be switched back on.
 */

export const EMPLOYEE_STATUSES = [
  "PENDING_MANAGER_APPROVAL",
  "PENDING_SECURITY_SETUP",
  "ACTIVE",
  "DISABLED",
  "REJECTED",
  "PENDING_TRANSFER_APPROVAL",
  "PENDING_TRANSFER_SETUP",
  "PENDING_OFFBOARDING_APPROVAL",
  "PENDING_OFFBOARDING_SETUP",
] as const;

export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export interface Employee {
  id: string;
  /** Given name — Active Directory `givenName`. */
  firstName: string;
  /** Surname — Active Directory `sn`. */
  lastName: string;
  /** The person's full name, as shown everywhere — AD `displayName`. */
  displayName: string;
  email: string;
  jobTitle: string;
  /** Description or details of the job position. */
  jobDescription?: string;
  department: string;
  /** Employment contract type: Permanent (Karyawan Tetap) or Contract. */
  employmentType?: "PERMANENT" | "CONTRACT";
  /** Expiration date for contract employees (ISO string). */
  expiredDate?: string;
  /** Work location: Pusat (Head Office) or Cabang (Branch Office). */
  locationType?: "PUSAT" | "CABANG";
  /** Branch office name if locationType is Cabang. */
  branchName?: string;
  managerName: string;
  /** Work email of the manager. This is where the approval email is sent. */
  managerEmail: string;
  /** Legacy Jira account identifier. It is no longer used for approvals. */
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
export const REQUEST_TYPES = ["ONBOARDING", "TRANSFER", "OFFBOARDING"] as const;

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
  jobDescription?: string;
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
  /** Who caused it — the person who decided from an email, an HC officer, or "HC Portal". */
  actor?: string;
  issueKey?: string;
}

/**
 * The handle a workflow step is tracked by: `MAIL-…` for the manager's
 * decision, `SEC-…` for the security team's work order.
 */
export interface ApprovalReference {
  key: string;
  /** The decision page the step's email links to. */
  url: string;
  /** Last status recorded for this step, as shown on the request card. */
  status?: string;
  /** Address the step was emailed to. Absent means nobody was asked. */
  assignee?: string;
}

/**
 * A step handed to someone by email.
 *
 * The token is what authenticates the decision: the recipient has no account
 * here, so possession of the emailed link is the only proof of identity
 * available. It is therefore random, single-use, and expires — and the link
 * opens a page rather than deciding on its own, because mail scanners and
 * link previewers follow every URL in a message and would otherwise approve
 * the request before a human had read it.
 */
export interface EmailHandoff {
  token: string;
  /** ISO timestamp; past this the link is dead and HC must resend. */
  expiresAt: string;
  /** Address the request was sent to, for the audit trail. */
  sentTo: string;
  sentAt: string;
  /** Set once the manager has answered, so the token cannot be replayed. */
  decidedAt?: string;
  decidedBy?: string;
}

export interface AccessRequest {
  id: string;
  employeeId: string;
  type: RequestType;
  stage: RequestStage;
  /** Why HC raised the request. Transfers and Offboardings. */
  reason?: string;
  /** Where the employee is moving to. Transfers only. */
  transfer?: TransferTarget;
  /**
   * Status to restore if a transfer is rejected — an employee whose move the
   * manager turns down keeps working where they are, not becoming REJECTED.
   */
  previousStatus?: EmployeeStatus;
  managerIssue?: ApprovalReference;
  /** The manager email handoff. */
  managerApproval?: EmailHandoff;
  /** The IT Security email handoff. */
  securityApproval?: EmailHandoff;
  securityIssue?: ApprovalReference;
  events: WorkflowEvent[];
  /**
   * Transitions already applied, as `${issueKey}:${status}`. A decision page can
   * be submitted twice — a double-click, a second tab — so a signal is claimed
   * before it is acted on.
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
  email: string;
  jobTitle: string;
  jobDescription?: string;
  department: string;
  employmentType?: "PERMANENT" | "CONTRACT";
  expiredDate?: string;
  locationType?: "PUSAT" | "CABANG";
  branchName?: string;
  managerName: string;
  managerEmail: string;
  /** Free-text note included in the approval emails. */
  description?: string;
  /** Optional override; normally resolved from `managerEmail`. */
  managerAccountId?: string;
}

/** Payload accepted by `POST /api/users/:id/transfer`. */
export interface TransferInput extends TransferTarget {
  reason?: string;
}

/**
 * The activity log: who did what, and when.
 *
 * A request's `events` already record the approval chain, but only for things
 * that go through it. Suspending an account does not — it is deliberately
 * unmediated, so HC can cut access immediately — which left the one action
 * nobody has to approve as the one action nothing recorded. `updatedAt` moved
 * and that was all: no actor, no reason, no way to tell an HC suspension from a
 * workflow step.
 *
 * This is the stream that answers "who touched this, and when", across every
 * action rather than per request.
 */
export const ACTIVITY_ACTIONS = [
  "user.created",
  "transfer.requested",
  "access.disabled",
  "access.enabled",
  "request.approved",
  "request.rejected",
  "request.completed",
  "directory.exported",
  "employee.profile_updated",
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export interface ActivityEntry {
  id: string;
  /** ISO timestamp. The log is read newest-first. */
  at: string;
  /**
   * The HC officer's name for anything done in this app, or the email recipient
   * for anything a webhook brought in. Never blank: an entry nobody can be
   * attributed to is not worth recording.
   */
  actor: string;
  action: ActivityAction;
  /** Who it was done to. Absent for actions that are not about one person. */
  employeeId?: string;
  employeeName?: string;
  /** One human-readable line, already in Indonesian. */
  detail: string;
}
