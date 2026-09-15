import { getAccount } from "@/lib/accounts/service";
import { verifyToken } from "@/lib/auth/guard";
import { fail, ok } from "@/lib/http/apiResponse";
import { preflight, withCors } from "@/lib/http/cors";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/**
 * GET /api/auth/me — the signed-in account.
 *
 * Read back from the database rather than returned straight from the token.
 * The token is a snapshot from up to fifteen minutes ago, so a role change or
 * a profile edit made since then would otherwise be invisible until the person
 * signed in again.
 */
export async function GET(request: Request) {
  const guarded = await verifyToken(request);
  if (!guarded.ok) return withCors(guarded.response, request);

  try {
    const user = await getAccount(guarded.user.sub);
    if (!user) {
      // A valid token for an account that has since been deleted.
      return withCors(fail("Akun tidak ditemukan.", 404), request);
    }

    return withCors(ok({ user }), request);
  } catch (error) {
    console.error("[auth/me]", error);
    return withCors(fail("Gagal memuat profil.", 500), request);
  }
}
