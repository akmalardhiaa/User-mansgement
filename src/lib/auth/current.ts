import { cookies } from "next/headers";

import { TOKEN_COOKIE, verifyAccessToken } from "./jwt";
import type { Role } from "./types";

/**
 * The signed-in account, for server components and route handlers.
 *
 * Reads the JWT that /api/auth/login issued. The Prisma `User` table is now
 * the only source of accounts — the old HC_AUTH_USERS list is gone — so this
 * is one identity across the dashboard and the account system rather than two
 * that have to be kept in step.
 *
 * Resolved from the token alone, with no database round trip: it is called on
 * essentially every render, and the claims are signed, so a query would buy
 * nothing but latency. Routes that must see changes made in the last few
 * minutes (a role change, a renamed profile) read the row themselves — see
 * GET /api/auth/me.
 */

export interface SessionUser {
  id: string;
  email: string;
  /** The person's full name, as shown in the chrome and in the audit trail. */
  name: string;
  role: Role;
}

export async function getCurrentUser(): Promise<SessionUser | undefined> {
  const store = await cookies();
  const payload = verifyAccessToken(store.get(TOKEN_COOKIE)?.value);
  if (!payload) return undefined;

  return {
    id: payload.sub,
    email: payload.email,
    name: payload.fullName,
    role: payload.role,
  };
}

/** How the signed-in person is credited in the audit trail. */
export async function getActorName(): Promise<string> {
  const user = await getCurrentUser();
  return user ? `${user.name} (HC)` : "HC Portal";
}

/** True when the signed-in account may administer other accounts. */
export async function isAdmin(): Promise<boolean> {
  return (await getCurrentUser())?.role === "ADMIN";
}
