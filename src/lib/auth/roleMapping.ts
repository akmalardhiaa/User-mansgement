import { PORTAL_ROLES, type PortalRole } from "./roles";

/**
 * Which AD group grants which portal role.
 *
 * Kept apart from `roles.ts` on purpose. The role model and the permission
 * matrix are plain data that client components legitimately need; this file
 * reads `process.env`, so it belongs only on the server. Splitting them stops
 * an innocent-looking import from dragging environment lookups into the browser
 * bundle, where they would silently resolve to undefined.
 *
 * Group names are configuration rather than code because they are a property of
 * the customer's directory, not of this app — and because an operator has to be
 * able to see, in one place, exactly which groups confer authority here.
 */

const ROLE_GROUP_ENV: Record<PortalRole, string> = {
  HC_REQUESTER: "AD_GROUP_HC",
  MANAGER: "AD_GROUP_MANAGER",
  CISO_APPROVER: "AD_GROUP_CISO",
  SYSTEM_ADMIN: "AD_GROUP_ADMIN",
  OPS_OPERATOR: "AD_GROUP_OPS",
  AUDITOR: "AD_GROUP_AUDITOR",
};

/**
 * Resolves the roles carried by a user's `memberOf` list.
 *
 * Matching is a case-insensitive substring so an operator can configure either
 * the full distinguished name or just `CN=HC Admins`. `LDAP_ADMIN_GROUP` is
 * still honoured as an alias for the SYSTEM_ADMIN group, so a deployment that
 * predates this change keeps working.
 */
export function rolesFromGroups(groups: readonly string[]): PortalRole[] {
  const memberOf = groups.map((group) => group.toLowerCase());
  const roles: PortalRole[] = [];

  for (const role of PORTAL_ROLES) {
    const configured = [
      process.env[ROLE_GROUP_ENV[role]],
      role === "SYSTEM_ADMIN" ? process.env.LDAP_ADMIN_GROUP : undefined,
    ];

    for (const raw of configured) {
      const needle = raw?.trim().toLowerCase();
      if (!needle) continue;
      if (memberOf.some((group) => group.includes(needle))) {
        roles.push(role);
        break;
      }
    }
  }

  return roles;
}

/**
 * True when at least one role group is configured.
 *
 * A deployment with none is not broken, but it is one where nobody can do
 * anything, so it is worth being able to say so on a status screen rather than
 * leaving an operator to guess why every page refuses them.
 */
export function isRoleMappingConfigured(): boolean {
  return (
    Object.values(ROLE_GROUP_ENV).some((name) => Boolean(process.env[name]?.trim())) ||
    Boolean(process.env.LDAP_ADMIN_GROUP?.trim())
  );
}
