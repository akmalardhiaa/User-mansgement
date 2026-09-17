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
 * Splits a distinguished name into its components, normalised for comparison.
 *
 * `CN=HC Admins,OU=Groups,DC=corp` becomes `["cn=hc admins", "ou=groups",
 * "dc=corp"]`. AD is inconsistent about the space after a comma, so each part is
 * trimmed rather than compared as written.
 */
function components(dn: string): string[] {
  return dn
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Whether one `memberOf` entry is the configured group.
 *
 * This used to be `group.includes(needle)`, and a bare substring is the wrong
 * test for a DN: `CN=HC Admins` also matched `CN=Former HC Admins,OU=Archive`
 * and `CN=HC Admins Read-Only`, so membership of an archived or read-only group
 * silently conferred the real one's authority. A comparison that decides who may
 * approve access cannot be one that matches half a name.
 *
 * Components are compared whole, and the configured value may be either the full
 * DN or a leading run of it — which keeps both documented forms working.
 */
function matchesGroup(memberOf: string, configured: string): boolean {
  const group = components(memberOf);
  const needle = components(configured);
  if (group.length === 0 || needle.length === 0) return false;

  // A bare name, `HC Officers` rather than `CN=HC Officers`. Undocumented but
  // an easy thing to type, so it is accepted explicitly against the common name
  // rather than by falling back to a loose match.
  if (needle.length === 1 && !needle[0].includes("=")) {
    const [attribute, ...value] = group[0].split("=");
    return attribute === "cn" && value.join("=") === needle[0];
  }

  return needle.every((part, index) => group[index] === part);
}

/**
 * Resolves the roles carried by a user's `memberOf` list.
 *
 * An operator may configure the full distinguished name, a leading part of it
 * such as `CN=HC Admins`, or the bare common name. What is never accepted is a
 * partial word — see `matchesGroup`. `LDAP_ADMIN_GROUP` is still honoured as an
 * alias for the SYSTEM_ADMIN group, so a deployment that predates this keeps
 * working.
 */
export function rolesFromGroups(groups: readonly string[]): PortalRole[] {
  const roles: PortalRole[] = [];

  for (const role of PORTAL_ROLES) {
    const configured = [
      process.env[ROLE_GROUP_ENV[role]],
      role === "SYSTEM_ADMIN" ? process.env.LDAP_ADMIN_GROUP : undefined,
    ];

    for (const raw of configured) {
      const needle = raw?.trim();
      if (!needle) continue;
      if (groups.some((group) => matchesGroup(group, needle))) {
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
