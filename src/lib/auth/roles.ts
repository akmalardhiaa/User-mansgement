/**
 * Portal roles and what each one may do.
 *
 * Two separate things are deliberately kept apart here:
 *
 *   - Being in Active Directory means you are an employee. It does not, on its
 *     own, grant any authority in this portal.
 *   - Holding a portal role means HC/IT put you in a group that was mapped to
 *     one. Somebody who signs in without a mapped group gets a session and
 *     their own profile, and nothing else.
 *
 * That separation is the point: an AD identity and an operator account are not
 * the same thing, and one must not silently imply the other.
 *
 * Roles are a set, not a single value. Separation of duties is checked per
 * decision (a requester may not approve their own request, a manager may not
 * act as CISO on the same one), so the system has to be able to see that one
 * person holds two hats before it can refuse to let them wear both at once.
 */

export const PORTAL_ROLES = [
  /** HC raises lifecycle requests and tracks them. Cannot approve or touch AD. */
  "HC_REQUESTER",
  /** Approves or rejects the first stage for requests routed to them. */
  "MANAGER",
  /** Approves or rejects the second stage — the access decision. */
  "CISO_APPROVER",
  /** Configures integrations and portal access. Cannot bypass the two approvals. */
  "SYSTEM_ADMIN",
  /** Sees failures, retries what is allowed. Cannot alter an approved payload. */
  "OPS_OPERATOR",
  /** Reads and exports the audit trail. Cannot create or change a decision. */
  "AUDITOR",
] as const;

export type PortalRole = (typeof PORTAL_ROLES)[number];

export function isPortalRole(value: unknown): value is PortalRole {
  return typeof value === "string" && (PORTAL_ROLES as readonly string[]).includes(value);
}

/**
 * Every guarded capability in the app.
 *
 * Handlers ask for a permission rather than a role, so the mapping below is the
 * single place the authorisation matrix lives — and the single place to read
 * when asked "who can do this?". Adding a role never means revisiting the
 * handlers.
 */
export const PERMISSIONS = [
  "directory.read",
  "directory.export",
  /*
   * Editing the fields that carry no access consequence — a corrected spelling,
   * a filled-in job description. Creating and disabling accounts used to live
   * beside this as `employee.create` and `employee.access.toggle`; both are gone,
   * because both are now requests that carry two approvals.
   */
  "employee.update",
  "activity.read",
  /* Lifecycle requests. */
  "request.read",
  "request.create",
  "request.cancel",
  /**
   * The two approvals. Held by different roles on purpose — one account able to
   * satisfy both would make the second signature worthless.
   */
  "approval.manager",
  "approval.ciso",
  /** One-off maintenance, such as retiring the legacy workflow. */
  "system.migrate",
  /** Running the execution worker, and retrying what it could not finish. */
  "execution.run",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * The authorisation matrix.
 *
 * Read down a column to answer "who can do X". Note what is NOT here:
 * SYSTEM_ADMIN cannot create or edit employees, and no role but HC can toggle
 * access — administering the portal is a different job from using it, and
 * collapsing the two is how an admin account quietly becomes a way around the
 * approval chain.
 */
const ROLE_PERMISSIONS: Record<PortalRole, readonly Permission[]> = {
  HC_REQUESTER: [
    "directory.read",
    "directory.export",
    "employee.update",
    "activity.read",
    "request.read",
    "request.create",
    "request.cancel",
  ],
  // An approver reads requests and answers their own stage. Note what is
  // absent: neither can raise a request, and neither carries the other's
  // approval.
  MANAGER: ["directory.read", "request.read", "approval.manager"],
  CISO_APPROVER: ["directory.read", "activity.read", "request.read", "approval.ciso"],
  SYSTEM_ADMIN: [
    "directory.read",
    "activity.read",
    "request.read",
    "system.migrate",
    "execution.run",
  ],
  OPS_OPERATOR: ["directory.read", "activity.read", "request.read", "execution.run"],
  AUDITOR: ["directory.read", "directory.export", "activity.read", "request.read"],
};

export function hasPermission(roles: readonly PortalRole[], permission: Permission): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission));
}

/** Every permission a set of roles adds up to. For the UI, never for a guard. */
export function permissionsOf(roles: readonly PortalRole[]): Permission[] {
  const granted = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) granted.add(permission);
  }
  return [...granted];
}

/*
 * Which AD group maps to which role lives in `roleMapping.ts`, not here: that
 * reads process.env and so is server-only, while everything above is plain data
 * the UI needs too.
 */
