import { cookies } from "next/headers";

import { authenticateAD } from "@/lib/auth/ad";
import { SESSION_COOKIE, createSession, sessionCookieOptions } from "@/lib/auth/session";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { preflight, withCors } from "@/lib/http/cors";
import { clientKey, rateLimit, resetRateLimit } from "@/lib/http/rateLimit";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/**
 * POST /api/auth/login — { username | email, password }.
 *
 * Verifies the credentials against Active Directory (or the local dev
 * fallback), then opens a server-side session and hands back its opaque id in
 * an httpOnly cookie. The password is never stored here, and neither is
 * anything the browser could replay elsewhere.
 *
 * A successful bind is not authority. Somebody in no mapped AD group signs in
 * with an empty role list and reaches their own profile only — the response
 * says so, so the UI can explain it rather than showing an empty dashboard.
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

    const { id, maxAgeSeconds } = await createSession({
      userId: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      roles: user.roles,
      department: user.department,
    });

    // A correct password clears the counter, so someone who fumbled their
    // password a few times is not then locked out by their own success.
    resetRateLimit(key);

    const store = await cookies();
    store.set(SESSION_COOKIE, id, sessionCookieOptions(maxAgeSeconds));

    return withCors(
      ok({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          roles: user.roles,
          department: user.department,
        },
      }),
      request,
    );
  } catch (error) {
    console.error("[auth/login]", error);
    return withCors(fail("Tidak bisa masuk saat ini. Coba lagi.", 500), request);
  }
}
