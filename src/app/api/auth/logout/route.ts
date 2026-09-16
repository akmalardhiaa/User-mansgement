import { cookies } from "next/headers";

import { SESSION_COOKIE, revokeSession, sessionCookieOptions } from "@/lib/auth/session";
import { ok } from "@/lib/http/apiResponse";
import { preflight, withCors } from "@/lib/http/cors";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/**
 * POST /api/auth/logout
 *
 * Revokes the session server-side, then clears the cookie. Both halves matter:
 * clearing the cookie only stops this browser from presenting the id, while
 * revoking is what makes a copy taken beforehand stop working. Under the
 * previous JWT this was impossible — signing out could not end a session, only
 * hide it.
 */
export async function POST(request: Request) {
  const store = await cookies();
  await revokeSession(store.get(SESSION_COOKIE)?.value, "logout");
  store.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return withCors(ok({ signedOut: true }), request);
}
