import { cookies } from "next/headers";

import { SESSION_COOKIE, readSessionToken, type SessionPayload } from "./session";

/**
 * The signed-in HC officer, for route handlers.
 *
 * Middleware already blocks unauthenticated requests, so this is for
 * attribution rather than access control — it names who raised a request in
 * the audit trail.
 */
export async function getCurrentUser(): Promise<SessionPayload | undefined> {
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value);
}

/** How the signed-in officer is credited in the audit trail. */
export async function getActorName(): Promise<string> {
  const user = await getCurrentUser();
  return user ? `${user.name} (HC)` : "HC Portal";
}
