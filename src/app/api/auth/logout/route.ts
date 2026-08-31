import { cookies } from "next/headers";

import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { ok } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout — clears the session cookie. */
export async function POST() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return ok({ signedOut: true });
}
