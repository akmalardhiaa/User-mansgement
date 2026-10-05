import { readLdapCa, type LdapEnv } from "@/lib/ad/ldapConnection";
import { DEV_USERS } from "./devUsers";
import { isLdapLoginConfigured, readLdapLoginConfig } from "./ldapLoginConfig";
import { authViaMockAd, isMockAdLoginEnabled } from "./mockAdAuth";
import { rolesFromGroups } from "./roleMapping";
import type { PortalRole } from "./roles";

export class LdapUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LdapUnavailableError";
  }
}

export function isInvalidCredentials(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 49;
}

export async function loginTlsOptions(
  url: string,
  env: LdapEnv = process.env,
): Promise<{
  ca?: Buffer;
  rejectUnauthorized: true;
  minVersion: "TLSv1.2";
  servername: string;
}> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new LdapUnavailableError("Alamat server Active Directory tidak valid.", { cause: error });
  }

  if ((env.NODE_ENV ?? process.env.NODE_ENV) === "production" && parsed.protocol !== "ldaps:") {
    throw new LdapUnavailableError("Login Active Directory production hanya menerima LDAPS.");
  }
  if (parsed.protocol !== "ldaps:") {
    throw new LdapUnavailableError("Login Active Directory hanya menerima koneksi LDAPS.");
  }

  const caPath = env.LDAP_CA_CERT_PATH?.trim();
  try {
    return {
      ...(caPath ? { ca: await readLdapCa(caPath) } : {}),
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
      servername: parsed.hostname,
    };
  } catch (error) {
    throw new LdapUnavailableError("Sertifikat Active Directory tidak bisa dibaca.", { cause: error });
  }
}

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
 * When no `LDAP_URL` or `AD_LDAP_URL` is set, a small local list (devUsers.ts) stands in so the
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
  return isLdapLoginConfigured();
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
      "AD_LDAP_URL/LDAP_URL belum diset. Login Active Directory tidak bisa dijalankan di production tanpa alamat server AD.",
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

  /*
   * The URL comes from the validated configuration, not from a second read of
   * the environment. That second read used `??`, which does not fall through
   * on an empty string: a .env with `AD_LDAP_URL=` left blank and LDAP_URL
   * filled in turned every login into "server unreachable", while every other
   * reader of these two variables, using `||`, saw a perfectly good URL.
   *
   * A configuration that cannot be read is the same outage from the login
   * screen, so it is reported the same way; the log keeps the detail.
   */
  let config;
  try {
    config = readLdapLoginConfig();
  } catch (error) {
    throw new LdapUnavailableError("Konfigurasi login Active Directory tidak bisa dipakai.", { cause: error });
  }
  const tlsOptions = await loginTlsOptions(config.url);

  // AD accepts either a UPN (user@domain) or DOMAIN\user for the bind. If the
  // caller typed a bare username and a domain is configured, build the UPN.
  const bindName =
    username.includes("@") || username.includes("\\") || !config.domain
      ? username
      : `${username}@${config.domain}`;
  // The bare account name, for the sAMAccountName lookup.
  const account = username.split("\\").pop()!.split("@")[0];

  const client = new Client({
    url: config.url,
    timeout: 8000,
    connectTimeout: 8000,
    tlsOptions,
  });

  try {
    // The authentication itself. Only result code 49 means wrong credentials.
    await client.bind(bindName, password);
  } catch (error) {
    await client.unbind().catch(() => undefined);
    if (isInvalidCredentials(error)) return null;
    throw new LdapUnavailableError("Server Active Directory tidak bisa dihubungi.", { cause: error });
  }

  try {
    const filter = `(&(objectClass=user)(|(userPrincipalName=${escapeFilter(bindName)})(sAMAccountName=${escapeFilter(account)})))`;
    const { searchEntries } = await client.search(config.baseDn, {
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
  } catch (error) {
    throw new LdapUnavailableError("Server Active Directory tidak bisa dihubungi.", { cause: error });
  } finally {
    await client.unbind().catch(() => undefined);
  }
}
