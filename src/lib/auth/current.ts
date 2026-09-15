import { cookies } from "next/headers";

import { TOKEN_COOKIE, verifyAccessToken } from "./jwt";
import type { Role } from "./types";

/**
 * The signed-in account, for server components and route handlers.
 *
 * Reads the JWT that /api/auth/login issued. The claims were set from Active
 * Directory at sign-in, so this is the app's single record of who is signed in.
 *
 * Resolved from the token alone, with no round trip: it is called on
 * essentially every render, and the claims are signed, so a lookup would buy
 * nothing but latency.
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
