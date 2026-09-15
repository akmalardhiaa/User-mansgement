import { verifyToken } from "@/lib/auth/guard";
import { ok } from "@/lib/http/apiResponse";
import { preflight, withCors } from "@/lib/http/cors";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/**
 * GET /api/auth/me — the signed-in account.
 *
 * Taken straight from the verified session token. There is no local user table
 * to read back from any more: the token's claims were set from Active Directory
 * at login and are the app's record of who is signed in.
 */
export async function GET(request: Request) {
  const guarded = await verifyToken(request);
  if (!guarded.ok) return withCors(guarded.response, request);

  const { sub, email, fullName, role } = guarded.user;
  return withCors(ok({ user: { id: sub, email, fullName, role } }), request);
}
