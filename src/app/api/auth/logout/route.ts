import { cookies } from "next/headers";

import { TOKEN_COOKIE, tokenCookieOptions } from "@/lib/auth/jwt";
import { ok } from "@/lib/http/apiResponse";
import { preflight, withCors } from "@/lib/http/cors";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/**
 * POST /api/auth/logout
 *
 * Clears the cookie. Worth being clear about the limit: a JWT carries its own
 * expiry and there is no server-side session list to delete from, so a copy of
 * the token taken before logout keeps working until it expires. The short
 * lifetime is what bounds that window; a revocation list (or a refresh-token
 * scheme with a revocable refresh token) is what would close it.
 */
export async function POST(request: Request) {
  const store = await cookies();
  store.set(TOKEN_COOKIE, "", tokenCookieOptions(0));
  return withCors(ok({ signedOut: true }), request);
}
