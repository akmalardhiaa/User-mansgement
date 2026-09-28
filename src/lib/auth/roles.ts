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

/*
 * Approvers are deliberately NOT portal roles.
 *
 * Managers and the CISO team used to sign in here as MANAGER and CISO_APPROVER
 * to decide from a dashboard. They no longer do: the portal is HC's working
 * tool, and nobody else signs in to it. An approver is a mailbox the request was
 * routed to — they decide from the email, through a single-use link bound to
 * their own address — and needs no account, role or session here at all.
 */
export const PORTAL_ROLES = [
  /** HC raises lifecycle requests and tracks them. Cannot approve or touch AD. */
  "HC_REQUESTER",
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
 * The roles in a list that still exist.
 *
 * A session or a stored record can carry a role that has since been retired —
 * MANAGER and CISO_APPROVER were — and a retired role must grant nothing,
 * including the right to be signed in at all.
 */
export function portalRolesOf(roles: readonly unknown[]): PortalRole[] {
  return roles.filter(isPortalRole);
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
   * Opening the edit-profile screen. It no longer writes anything by itself:
   * saving raises a PROFILE_UPDATE request, which also needs `request.create`
   * and carries two approvals. Creating and disabling accounts used to live
   * beside this as `employee.create` and `employee.access.toggle`; both are gone
   * for the same reason.
   */
  "employee.update",
  "activity.read",
  /* Lifecycle requests. */
  "request.read",
  "request.create",
  "request.cancel",
  /*
   * There is no approval permission. Both approvals are given from the email,
   * authenticated by a link issued to one approver's address, not by a portal
   * session — so no role here can approve anything, SYSTEM_ADMIN included.
   */
  /**
   * Registering and ending delegations: who answers for a manager who is away.
   * HC's alone — it changes who is asked to approve, so it belongs with the
   * people who raise requests and never with those who configure the portal.
   */
  "delegation.manage",
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
    "delegation.manage",
  ],
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
