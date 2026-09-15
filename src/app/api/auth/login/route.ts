import { cookies } from "next/headers";

import { authenticate, toPublicUser } from "@/lib/accounts/service";
import { TOKEN_COOKIE, createAccessToken, secondsUntilExpiry, tokenCookieOptions, verifyAccessToken } from "@/lib/auth/jwt";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { preflight, withCors } from "@/lib/http/cors";
import { clientKey, rateLimit, resetRateLimit } from "@/lib/http/rateLimit";
import { parseLoginInput } from "@/lib/validation/accountInput";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/**
 * POST /api/auth/login
 *
 * Exchanges credentials for a short-lived JWT, delivered as an httpOnly
 * cookie. The token is not in the response body: httpOnly is what stops an
 * injected script from reading it, and handing the same value back in JSON
 * would put it right back within reach of `document`-level code.
 */
export async function POST(request: Request) {
  // Ten attempts per five minutes per address. A person who has mistyped their
  // password twice is unaffected; a script working through a wordlist is not.
  const key = clientKey(request, "login");
  const limit = rateLimit(key, 10, 5 * 60 * 1000);
  if (!limit.allowed) {
    return withCors(
      fail("Terlalu banyak percobaan masuk. Coba lagi sebentar lagi.", 429, {
        retryAfter: limit.retryAfter,
      }),
      request,
    );
  }

  const parsed = parseLoginInput(await readJson(request));
  if (!parsed.ok) {
    return withCors(fail("Email dan kata sandi wajib diisi.", 422, { fieldErrors: parsed.errors }), request);
  }

  try {
    const outcome = await authenticate(parsed.value.email, parsed.value.password);

    if (outcome.status === "bad-credentials") {
      // One message for both an unknown address and a wrong password, so the
      // response never reveals which accounts exist.
      return withCors(fail("Email atau kata sandi salah.", 401), request);
    }

    if (outcome.status === "unverified") {
      return withCors(
        fail("Email belum dikonfirmasi. Cek kotak masuk Anda untuk tautan konfirmasi.", 403, {
          code: "EMAIL_NOT_VERIFIED",
          email: outcome.email,
        }),
        request,
      );
    }

    if (outcome.status === "pending-approval") {
      const rejected = outcome.approvalStatus.endsWith("_REJECTED");
      return withCors(
        fail(
          rejected
            ? "Permohonan akun Anda ditolak. Hubungi Human Capital untuk informasi lebih lanjut."
            : "Akun Anda belum aktif. Masih menunggu persetujuan manager dan CISO / IT Security.",
          403,
          { code: rejected ? "APPROVAL_REJECTED" : "APPROVAL_PENDING" },
        ),
        request,
      );
    }

    const token = createAccessToken({
      id: outcome.user.id,
      email: outcome.user.email,
      fullName: outcome.user.fullName,
      role: outcome.user.role,
    });

    // A correct password clears the counter, so someone who fumbled their
    // password a few times is not then locked out by their own success.
    resetRateLimit(key);

    const payload = verifyAccessToken(token);
    const store = await cookies();
    store.set(TOKEN_COOKIE, token, tokenCookieOptions(payload ? secondsUntilExpiry(payload) : 900));

    return withCors(ok({ user: toPublicUser(outcome.user) }), request);
  } catch (error) {
    console.error("[auth/login]", error);
    return withCors(fail("Tidak bisa masuk saat ini. Coba lagi.", 500), request);
  }
}
