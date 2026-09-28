/**
 * The lifecycle request domain.
 *
 * One entity covers all three things HC asks for — creating an account, moving
 * somebody between divisions, and closing an account down. They were three
 * separate shapes before, which is how the approval chain ended up being
 * implemented once properly and twice badly.
 *
 * Two ideas carry most of the weight here:
 *
 *   1. A request records a PROPOSED change. It is not the change. The directory
 *      keeps showing what is actually true about an account until an execution
 *      is verified, so a pending Movement never makes somebody look like they
 *      have already moved.
 *
 *   2. Once submitted, the payload is frozen and fingerprinted. Approvals are
 *      recorded against a specific `version` and `payloadHash`, so a decision
 *      always refers to something exact. Editing after submit does not mutate
 *      the request — it creates a new version, and the old approvals stop
 *      counting, because nobody approved the new text.
 */

export const LIFECYCLE_TYPES = ["ONBOARDING", "MOVEMENT", "TERMINATION", "PROFILE_UPDATE"] as const;

export type LifecycleType = (typeof LIFECYCLE_TYPES)[number];

/**
 * Where a request sits.
 *
 * Note that APPROVED and COMPLETED are separate, deliberately. The second
 * approval authorises the change; it does not perform it. Collapsing the two
 * would let the dashboard claim an account exists because somebody said it
 * should, which is precisely the failure the plan calls out.
 *
 * The statuses from SCHEDULED onward belong to the execution worker, which does
 * not exist yet. They are defined now because the transition table is the
 * contract the worker will be written against, and a half-declared state
 * machine is how illegal transitions get invented later.
 */
export const LIFECYCLE_STATUSES = [
  "DRAFT",
  "PENDING_MANAGER",
  "PENDING_CISO",
  "APPROVED",
  "SCHEDULED",
  "QUEUED",
  "EXECUTING",
  "COMPLETED",
  "FAILED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
] as const;

export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

/** The two approvals, in the order they are asked for. */
export const APPROVAL_STAGES = ["MANAGER", "CISO"] as const;

export type ApprovalStage = (typeof APPROVAL_STAGES)[number];

export type ApprovalDecision = "APPROVED" | "REJECTED";

/**
 * Somebody who acts on a request.
 *
 * `email` is how a person is reached and displayed. `userId` is how they are
 * identified when it matters — it is the stable AD account name, and it is what
 * an authorisation check compares. Email is an attribute that changes; it is
 * not proof of identity, and it is not used as one.
 */
export interface ActorIdentity {
  name: string;
  email: string;
  /** Stable account id. Absent for an approver who has never signed in here. */
  userId?: string;
}

/**
 * One approval stage, recorded against one version of one request.
 *
 * A step is created when the stage is reached and never rewritten: a decision
 * on version 2 is a different step from a decision on version 1, so a revision
 * cannot silently inherit an approval that was given for different text.
 */
export interface ApprovalStep {
  stage: ApprovalStage;
  /** Which version of the request this step decides on. */
  version: number;
  /**
   * Who was asked, resolved server-side at submit and frozen here. For a stage
   * answered by a team this names the team, and `pool` lists its members.
   */
  approver: ActorIdentity;
  /**
   * Everyone who may answer this stage, when it goes to a team rather than one
   * person. Frozen at submit: somebody who joins the team later was never asked
   * about this request, and somebody who left still was. The first member to
   * answer decides for the stage; every other member's link dies with it.
   */
  pool?: ActorIdentity[];
  decision?: ApprovalDecision;
  /** Mandatory when the decision is REJECTED. */
  reason?: string;
  decidedAt?: string;
  /** Who actually answered. Compared against `approver` before it is accepted. */
  decidedBy?: ActorIdentity;
}

/* -------------------------------------------------------------------------- */
/* Payloads                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Four kinds, because the company's account numbering says there are four:
 * permanent, contract, vendor and intern. See lifecycle/employment.ts for the
 * digit each one ends an address with, and for which of them end on a date.
 */
export type EmploymentType = "PERMANENT" | "CONTRACT" | "VENDOR" | "INTERN";
export type LocationType = "PUSAT" | "CABANG";

/** Creating an account for somebody who does not have one yet. */
export interface OnboardingPayload {
  kind: "ONBOARDING";
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  jobTitle: string;
  jobDescription?: string;
  department: string;
  employmentType: EmploymentType;
  /** Required for a contract, absent otherwise. */
  expiredDate?: string;
  locationType: LocationType;
  branchName?: string;
  managerName: string;
  managerEmail: string;
  startDate: string;
  accessProfileId: string;
}

/** Moving somebody who already has an account into a different position. */
export interface MovementPayload {
  kind: "MOVEMENT";
  employeeId: string;
  toDepartment: string;
  toJobTitle: string;
  toJobDescription?: string;
  toManagerName: string;
  toManagerEmail: string;
  accessProfileId: string;
  /**
   * Why the move was asked for. Optional since the field was taken off the
   * form: requests raised before that still carry one, and it is still shown
   * wherever it exists.
   */
  reason?: string;
}

/**
 * Closing an account down.
 *
 * `reasonCategory` rather than free prose: the reason travels into approval
 * emails, and the narrative behind somebody leaving is not something to copy
 * into every inbox on the approval chain. A short internal note stays here.
 */
export interface TerminationPayload {
  kind: "TERMINATION";
  employeeId: string;
  reasonCategory: TerminationReason;
  lastWorkingDate: string;
  /** Who picks up the work. Free text, optional. */
  handoverTo?: string;
  /** Internal note. Never included in an approval email body. */
  note?: string;
}

export const TERMINATION_REASONS = [
  "RESIGN",
  "CONTRACT_END",
  "RETIREMENT",
  "TERMINATION",
  "OTHER",
] as const;

export type TerminationReason = (typeof TERMINATION_REASONS)[number];

/**
 * The editable profile of an existing employee, as it will read once applied.
 *
 * Email and manager are absent on purpose. Email is the key that ties the record
 * to its login account; the manager is who approves changes to this person, so
 * letting the same request move them would let a request choose its own
 * approver. Both belong to Movement.
 */
export interface ProfileFields {
  firstName: string;
  lastName: string;
  displayName: string;
  jobTitle: string;
  jobDescription?: string;
  department: string;
  employmentType?: EmploymentType;
  expiredDate?: string;
  locationType?: LocationType;
  branchName?: string;
  /** Internal HC note. Never included in an approval email body. */
  description?: string;
}

export type ProfileField = keyof ProfileFields;

/** One field a profile update changes, as it read before and as it will read after. */
export interface ProfileChange {
  field: ProfileField;
  label: string;
  from: string;
  to: string;
}

/**
 * Editing an existing employee's profile.
 *
 * This used to be a direct write with no approval at all — including department
 * and job title, which is how a division change could skip the manager and the
 * CISO entirely. It is now a request like the others: frozen at submit, decided
 * twice, and applied only by the worker after the directory confirms it.
 *
 * `changes` is computed by the server against the record as it stood, never
 * taken from the browser. It is what the approvers read — "department: A → B" —
 * and a diff the requester could write themselves would be a diff that lies.
 */
export interface ProfileUpdatePayload {
  kind: "PROFILE_UPDATE";
  employeeId: string;
  profile: ProfileFields;
  changes: ProfileChange[];
}

export type LifecyclePayload =
  | OnboardingPayload
  | MovementPayload
  | TerminationPayload
  | ProfileUpdatePayload;

/* -------------------------------------------------------------------------- */
/* The request                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Who the request is about, for display and searching.
 *
 * Denormalised on purpose. For an Onboarding there is no employee record to
 * join to yet, and for the other two the record may change after the fact —
 * this is what the request was raised about, as it stood then.
 */
export interface RequestSubject {
  displayName: string;
  email?: string;
  department?: string;
}

export interface LifecycleRequest {
  id: string;
  type: LifecycleType;
  /** Bumped by a revision. Approvals are scoped to it. */
  version: number;
  status: LifecycleStatus;
  requester: ActorIdentity;
  /** Set for every type but ONBOARDING, which has no record yet. */
  employeeId?: string;
  subject: RequestSubject;
  payload: LifecyclePayload;
  /** SHA-256 over the canonical payload. Empty until submitted. */
  payloadHash: string;
  /**
   * The attributes this request was raised against, for the stages that change
   * an existing account. Execution compares against it and stops if the account
   * has drifted since — rather than overwriting somebody else's change blind.
   */
  beforeSnapshot?: Record<string, string>;
  approvals: ApprovalStep[];
  /** When the change should take effect. Absent means as soon as it is approved. */
  effectiveAt?: string;
  /** Which revision of the routing and approval rules this was raised under. */
  policyVersion: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  closedAt?: string;
  /** Why a terminal request ended the way it did. */
  closedReason?: string;
}

/**
 * The audit trail.
 *
 * Separate from the existing activity log, which is capped at 500 entries and
 * trimmed — fine for a recent-changes feed, useless as evidence. This one is
 * append-only and never trimmed, and every entry commits in the same
 * transaction as the change it describes, so the record cannot disagree with
 * what happened.
 */
export interface AuditEvent {
  id: string;
  at: string;
  /** Stable id of whoever acted, or a system component name. */
  actorId: string;
  actorName: string;
  /** Where the action came in from. */
  source: "PORTAL" | "EMAIL" | "WORKER" | "SYSTEM";
  /** Machine-readable, e.g. "request.submitted". */
  action: string;
  /** What it was done to, e.g. a request id. */
  target: string;
  /** Ties every event of one flow together, end to end. */
  correlationId: string;
  /** Small, non-sensitive extras. Never secrets, never a whole payload. */
  detail?: Record<string, string | number | boolean>;
}
