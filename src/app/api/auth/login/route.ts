import { cookies } from "next/headers";

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { isAuthConfigured, verifyCredentials } from "@/lib/auth/users";
import { fail, ok, readJson } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

/** POST /api/auth/login — exchanges credentials for a signed session cookie. */
export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return fail(
      "Login belum dikonfigurasi: setel HC_AUTH_USERS dan AUTH_SECRET. Lihat .env.example.",
      503,
    );
  }

  const body = (await readJson(request)) as { email?: unknown; password?: unknown } | undefined;
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return fail("Email dan kata sandi wajib diisi.", 422);
  }

  const user = verifyCredentials(email, password);
  if (!user) {
    // One message for both unknown email and wrong password, so the response
    // never reveals which accounts exist.
    return fail("Email atau kata sandi salah.", 401);
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(user), sessionCookieOptions(SESSION_MAX_AGE));

  return ok({ user: { email: user.email, name: user.name } });
}
