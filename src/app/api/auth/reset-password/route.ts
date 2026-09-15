import { cookies } from "next/headers";

import { resetPassword } from "@/lib/accounts/service";
import { TOKEN_COOKIE, tokenCookieOptions } from "@/lib/auth/jwt";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { preflight, withCors } from "@/lib/http/cors";
import { clientKey, rateLimit } from "@/lib/http/rateLimit";
import { parseResetPasswordInput } from "@/lib/validation/accountInput";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/**
 * POST /api/auth/reset-password
 *
 * Sets a new password from a reset token. The token is cleared on use, so the
 * link works exactly once — a reset mail sitting in a mailbox, or in a mail
 * archive, is not a standing key to the account.
 */
export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, "reset-password"), 20, 15 * 60 * 1000);
  if (!limit.allowed) {
    return withCors(
      fail("Terlalu banyak percobaan. Coba lagi nanti.", 429, { retryAfter: limit.retryAfter }),
      request,
    );
  }

  const parsed = parseResetPasswordInput(await readJson(request));
  if (!parsed.ok) {
    return withCors(fail("Perbaiki isian yang ditandai.", 422, { fieldErrors: parsed.errors }), request);
  }

  try {
    const outcome = await resetPassword(parsed.value.token, parsed.value.password);

    if (outcome.status === "expired") {
      return withCors(
        fail("Tautan sudah kedaluwarsa. Minta tautan baru.", 410, { code: "TOKEN_EXPIRED" }),
        request,
      );
    }

    if (outcome.status === "invalid") {
      return withCors(
        fail("Tautan tidak valid atau sudah dipakai.", 400, { code: "TOKEN_INVALID" }),
        request,
      );
    }

    // Any session opened before the reset is now stale. Clearing the cookie
    // makes the person sign in with the new password, which is also the
    // clearest signal that the change took effect.
    const store = await cookies();
    store.set(TOKEN_COOKIE, "", tokenCookieOptions(0));

    return withCors(ok({ message: "Kata sandi diperbarui. Silakan masuk." }), request);
  } catch (error) {
    console.error("[auth/reset-password]", error);
    return withCors(fail("Gagal mengatur ulang kata sandi. Coba lagi.", 500), request);
  }
}
