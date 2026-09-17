import { DEV_USERS } from "./devUsers";
import { authViaMockAd, isMockAdLoginEnabled } from "./mockAdAuth";
import { rolesFromGroups } from "./roleMapping";
import type { PortalRole } from "./roles";

/**
 * Authentication against Active Directory (LDAP).
 *
 * The user's own username and password are used to bind to AD: if the bind
 * succeeds, they are who they say they are, and this app never stores their
 * password. Their name, email and department are read from their AD record.
 *
 * Portal authority is a separate question, answered by group membership — see
 * roles.ts. A successful bind proves identity and nothing more: somebody who is
 * in AD but in none of the mapped groups signs in and gets their own profile,
 * not the directory.
 *
 * When no `LDAP_URL` is set, a small local list (devUsers.ts) stands in so the
 * portal runs before a real AD server is available. That fallback is refused in
 * production: there, a missing LDAP_URL is a configuration error, not a reason
 * to let anyone in with a demo password.
 *
 * `ldapts` is imported dynamically so the app builds and runs in dev without it
 * installed; it is only loaded on the real LDAP path.
 */

export interface AdUser {
  /** Stable identifier — the AD sAMAccountName, or the username in dev. */
  id: string;
  username: string;
  email: string;
  fullName: string;
  /** Portal roles this person's AD groups map to. Often empty, and that is fine. */
  roles: PortalRole[];
  department?: string;
}

export function isLdapConfigured(): boolean {
  return Boolean(process.env.LDAP_URL?.trim());
}

/** True when the portal can authenticate anyone at all (real AD, or dev fallback). */
export function isAuthConfigured(): boolean {
  return isLdapConfigured() || process.env.NODE_ENV !== "production";
}

export async function authenticateAD(username: string, password: string): Promise<AdUser | null> {
  const user = username.trim();
  if (!user || !password) return null;

  if (isLdapConfigured()) return authViaLdap(user, password);

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "LDAP_URL belum diset. Login Active Directory tidak bisa dijalankan di production tanpa alamat server AD.",
    );
  }

  /*
   * The simulated directory, when asked for.
   *
   * Tried ahead of the hardcoded list because it is the more faithful of the
   * two: roles come from group membership rather than being written out per
   * account, so signing in exercises the same mapping a real domain controller
   * would.
   *
   * An account it does not recognise FALLS THROUGH rather than being refused.
   * Turning this on would otherwise silently kill the demo logins — `admin` and
   * the rest live only in devUsers.ts — and a switch that locks somebody out of
   * their own portal is not a switch anybody should have to think twice about.
   * The two name sets do not overlap, so there is nothing ambiguous about
   * consulting both.
   *
   * Its own variable rather than reusing AD_DRIVER, which selects the EXECUTION
   * driver. One switch that silently changed both would be a switch nobody could
   * reason about.
   */
  if (isMockAdLoginEnabled()) {
    const viaMock = await authViaMockAd(user, password);
    if (viaMock) return viaMock;
  }

  return authViaDev(user, password);
}

/* ------------------------------------------------------------- dev fallback */

function authViaDev(username: string, password: string): AdUser | null {
  const key = username.toLowerCase();
  const match = DEV_USERS.find(
    (candidate) => candidate.username.toLowerCase() === key || candidate.email.toLowerCase() === key,
  );
  // A constant-ish comparison is unnecessary here: this path only runs in local
  // development against throwaway credentials.
  if (!match || match.password !== password) return null;
  return {
    id: match.username,
    username: match.username,
    email: match.email,
    fullName: match.fullName,
    roles: [...match.roles],
    department: match.department,
  };
}

/* ---------------------------------------------------------------- real LDAP */

/** RFC 4515 escaping, so a username with `(`, `)`, `*` or `\` cannot alter the filter. */
function escapeFilter(value: string): string {
  return value.replace(/[\\*()\0]/g, (char) => `\\${char.charCodeAt(0).toString(16).padStart(2, "0")}`);
}

function firstString(value: unknown): string {
  if (Array.isArray(value)) return value.length ? String(value[0]) : "";
  return value === undefined || value === null ? "" : String(value);
}

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return value === undefined || value === null ? [] : [String(value)];
}

async function authViaLdap(username: string, password: string): Promise<AdUser | null> {
  const { Client } = await import("ldapts");

  const url = process.env.LDAP_URL!.trim();
  const domain = process.env.LDAP_DOMAIN?.trim();
  const baseDN = process.env.LDAP_BASE_DN?.trim() ?? "";

  // AD accepts either a UPN (user@domain) or DOMAIN\user for the bind. If the
  // caller typed a bare username and a domain is configured, build the UPN.
  const bindName =
    username.includes("@") || username.includes("\\") || !domain ? username : `${username}@${domain}`;
  // The bare account name, for the sAMAccountName lookup.
  const account = username.split("\\").pop()!.split("@")[0];

  const client = new Client({ url, timeout: 8000, connectTimeout: 8000 });

  try {
    // The authentication itself: a failed bind means wrong credentials.
    await client.bind(bindName, password);
  } catch {
    await client.unbind().catch(() => undefined);
    return null;
  }

  try {
    const filter = `(&(objectClass=user)(|(userPrincipalName=${escapeFilter(bindName)})(sAMAccountName=${escapeFilter(account)})))`;
    const { searchEntries } = await client.search(baseDN, {
      scope: "sub",
      filter,
      attributes: ["displayName", "mail", "userPrincipalName", "sAMAccountName", "department", "memberOf"],
    });

    const entry = searchEntries[0];

    return {
      id: firstString(entry?.sAMAccountName) || account,
      username: account,
      email: firstString(entry?.mail) || firstString(entry?.userPrincipalName) || bindName,
      fullName: firstString(entry?.displayName) || account,
      roles: rolesFromGroups(asArray(entry?.memberOf)),
      department: firstString(entry?.department) || undefined,
    };
  } finally {
    await client.unbind().catch(() => undefined);
  }
}
