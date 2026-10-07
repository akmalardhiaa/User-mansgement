import { cookies } from "next/headers";

import { recordSecurityEvent } from "@/lib/auth/securityLog";
import { SESSION_COOKIE, resolveSession, revokeSession, sessionCookieOptions } from "@/lib/auth/session";
import { ok } from "@/lib/http/apiResponse";
import { preflight, withCors } from "@/lib/http/cors";
import { clientAddress } from "@/lib/http/rateLimit";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/** POST /api/auth/logout — ends the session server-side, not just in the browser. */
export async function POST(request: Request) {
  const store = await cookies();
  const id = store.get(SESSION_COOKIE)?.value;
  const session = await resolveSession(id);
  await revokeSession(id, "logout");
  store.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  if (session) {
    await recordSecurityEvent({ type: "logout", username: session.username, ip: clientAddress(request) });
  }
  return withCors(ok({ signedOut: true }), request);
}
