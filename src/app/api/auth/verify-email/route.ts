import { verifyEmailToken } from "@/lib/accounts/service";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { preflight, withCors } from "@/lib/http/cors";
import { clientKey, rateLimit } from "@/lib/http/rateLimit";
import { parseTokenInput } from "@/lib/validation/accountInput";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/**
 * POST /api/auth/verify-email
 *
 * Consumes a verification token. The token is single-use: a second attempt
 * with the same value reports "invalid", which is also what an attacker
 * guessing tokens sees, so the two are indistinguishable from outside.
 */
export async function POST(request: Request) {
  // A 64-character random token is not realistically guessable, but a limit
  // here still stops a client burning database reads in a loop.
  const limit = rateLimit(clientKey(request, "verify-email"), 20, 15 * 60 * 1000);
  if (!limit.allowed) {
    return withCors(
      fail("Terlalu banyak percobaan. Coba lagi nanti.", 429, { retryAfter: limit.retryAfter }),
      request,
    );
  }

  const parsed = parseTokenInput(await readJson(request));
  if (!parsed.ok) {
    return withCors(fail("Token tidak valid.", 422, { fieldErrors: parsed.errors }), request);
  }

  try {
    const outcome = await verifyEmailToken(parsed.value.token);

    switch (outcome.status) {
      case "verified":
        return withCors(
          ok({ user: outcome.user, message: "Email terkonfirmasi. Silakan masuk." }),
          request,
        );

      case "already-verified":
        // Not an error: following the same link twice, or having two copies of
        // the mail open, should read as success rather than a failure the
        // person cannot act on.
        return withCors(
          ok({ user: outcome.user, message: "Email ini sudah terkonfirmasi. Silakan masuk." }),
          request,
        );

      case "expired":
        return withCors(
          fail("Tautan konfirmasi sudah kedaluwarsa. Minta tautan baru.", 410, {
            code: "TOKEN_EXPIRED",
          }),
          request,
        );

      default:
        return withCors(
          fail("Tautan konfirmasi tidak valid atau sudah dipakai.", 400, { code: "TOKEN_INVALID" }),
          request,
        );
    }
  } catch (error) {
    console.error("[auth/verify-email]", error);
    return withCors(fail("Konfirmasi email gagal. Coba lagi.", 500), request);
  }
}
