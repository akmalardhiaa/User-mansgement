import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { hasPermission, type Permission } from "./roles";
import { SESSION_COOKIE, resolveSession, type PortalSession } from "./session";

/**
 * The signed-in session, for server components.
 *
 * Reads the stored session record rather than a token's claims, so a session
 * that was revoked — by logout, by a role change, by an operator — stops
 * working on the very next render rather than at the end of a token lifetime.
 */

export async function getSession(): Promise<PortalSession | undefined> {
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value);
}

/**
 * The session, or a redirect to the login page.
 *
 * For pages. `proxy.ts` only checks that a cookie is present, so a stale or
 * revoked cookie still reaches the page — this is what actually turns it away.
 */
export async function requirePageSession(returnTo: string): Promise<PortalSession> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return session;
}

/** True when the signed-in person's roles cover `permission`. */
export async function can(permission: Permission): Promise<boolean> {
  const session = await getSession();
  return session ? hasPermission(session.roles, permission) : false;
}

/** How the signed-in person is credited in the audit trail. */
export async function getActorName(): Promise<string> {
  const session = await getSession();
  return session ? `${session.fullName} (${session.username})` : "HC Portal";
}

/** The same credit, from a session already in hand. */
export function actorNameOf(session: PortalSession): string {
  return `${session.fullName} (${session.username})`;
}
