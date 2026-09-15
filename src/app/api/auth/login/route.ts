import { cookies } from "next/headers";

import { authenticateAD } from "@/lib/auth/ad";
import { TOKEN_COOKIE, createAccessToken, secondsUntilExpiry, tokenCookieOptions, verifyAccessToken } from "@/lib/auth/jwt";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { preflight, withCors } from "@/lib/http/cors";
import { clientKey, rateLimit, resetRateLimit } from "@/lib/http/rateLimit";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/**
 * POST /api/auth/login — { username | email, password }.
 *
 * Verifies the credentials against Active Directory (or the local dev fallback),
 * then issues a short-lived JWT as an httpOnly cookie. The password is never
 * stored here: AD checks it, and only a signed session token comes back.
 */
export async function POST(request: Request) {
  // Ten attempts per five minutes per address. A person who has mistyped their
  // password twice is unaffected; a script working through a wordlist is not.
  const key = clientKey(request, "login");
  const limit = rateLimit(key, 10, 5 * 60 * 1000);
  if (!limit.allowed) {
    return withCors(
      fail("Terlalu banyak percobaan masuk. Coba lagi sebentar lagi.", 429, { retryAfter: limit.retryAfter }),
      request,
    );
  }

  const body = (await readJson(request)) as { username?: unknown; email?: unknown; password?: unknown } | undefined;
  const username =
    typeof body?.username === "string" ? body.username.trim() : typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!username || !password) {
    return withCors(
      fail("Username dan kata sandi wajib diisi.", 422, {
        fieldErrors: {
          ...(username ? {} : { username: "Username wajib diisi." }),
          ...(password ? {} : { password: "Kata sandi wajib diisi." }),
        },
      }),
      request,
    );
  }

  try {
    const user = await authenticateAD(username, password);

    // One message for both an unknown account and a wrong password, so the
    // response never reveals which usernames exist.
    if (!user) return withCors(fail("Username atau kata sandi salah.", 401), request);

    const token = createAccessToken({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    });

    // A correct password clears the counter, so someone who fumbled their
    // password a few times is not then locked out by their own success.
    resetRateLimit(key);

    const payload = verifyAccessToken(token);
    const store = await cookies();
    store.set(TOKEN_COOKIE, token, tokenCookieOptions(payload ? secondsUntilExpiry(payload) : 900));

    return withCors(
      ok({ user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, department: user.department } }),
      request,
    );
  } catch (error) {
    console.error("[auth/login]", error);
    return withCors(fail("Tidak bisa masuk saat ini. Coba lagi.", 500), request);
  }
}
