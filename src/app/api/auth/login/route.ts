import { cookies } from "next/headers";

import { authenticateAD, LdapUnavailableError } from "@/lib/auth/ad";
import { completeSignIn, enrollmentView, publicUser } from "@/lib/auth/loginFlow";
import { LOGIN_LOCK_MINUTES, accountLock, recordLoginFailure } from "@/lib/auth/loginThrottle";
import { MfaUnreadableError, isLoginMfaEnabled, readEnrollment } from "@/lib/auth/mfa";
import { PENDING_COOKIE, PENDING_TTL_MS, beginPendingLogin, pendingCookieOptions } from "@/lib/auth/pendingLogin";
import { portalRolesOf } from "@/lib/auth/roles";
import { recordSecurityEvent } from "@/lib/auth/securityLog";
import { generateTotpSecret } from "@/lib/auth/totp";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { preflight, withCors } from "@/lib/http/cors";
import { clientAddress, clientKey, rateLimit, resetRateLimit } from "@/lib/http/rateLimit";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/**
 * POST /api/auth/login — { username | email, password }.
 *
 * Step one of two. Verifies the password against Active Directory (or, on a
 * laptop that asked for it, the demo accounts) and checks the person belongs
 * in this portal. Then:
 *
 *   - LOGIN_2FA on (the default): no session yet. A short-lived step cookie
 *     is set and the answer is `{ mfa: { mode } }` — "verify" for a person
 *     with an authenticator enrolled, "enroll" with a QR code for a first
 *     sign-in. /api/auth/mfa finishes the sign-in.
 *   - LOGIN_2FA=off: the session is opened here, as before.
 *
 * The password is never stored, and neither is anything the browser could
 * replay elsewhere.
 */
export async function POST(request: Request) {
  const ip = clientAddress(request);

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

  // Before AD is asked: a locked account must not add to the domain's own
  // lockout count, which is the harm this lock exists to prevent.
  const lock = accountLock(username);
  if (lock.locked) {
    await recordSecurityEvent({ type: "login.locked", username, ip, detail: "ditolak selama terkunci" });
    return withCors(lockedResponse(lock.retryAfter), request);
  }

  try {
    const user = await authenticateAD(username, password);

    // One message for both an unknown account and a wrong password, so the
    // response never reveals which usernames exist.
    if (!user) {
      const nowLocked = recordLoginFailure(username);
      await recordSecurityEvent({
        type: nowLocked ? "login.locked" : "login.failed",
        username,
        ip,
        detail: nowLocked ? `kata sandi salah; akun dikunci ${LOGIN_LOCK_MINUTES} menit` : "kata sandi salah",
      });
      if (nowLocked) return withCors(lockedResponse(LOGIN_LOCK_MINUTES * 60), request);
      return withCors(fail("Username atau kata sandi salah.", 401), request);
    }

    /*
     * Only HC signs in here. Every other employee — managers and the CISO team
     * included — is a valid AD account with no business in this portal: they
     * approve from the email they are sent, and never need a session.
     *
     * Refused before any session exists. The message is specific on purpose:
     * a manager told "wrong password" would reset a password that works and
     * file a ticket about it. The rate limit is NOT reset here, so this answer
     * cannot be used to test passwords faster than a failed login would.
     */
    if (portalRolesOf(user.roles).length === 0) {
      await recordSecurityEvent({ type: "login.denied", username: user.username, ip, detail: "bukan anggota group portal" });
      return withCors(
        fail(
          "Portal ini hanya untuk tim Human Capital. Manager dan tim CISO memberikan persetujuan langsung dari email yang mereka terima.",
          403,
          { code: "NOT_A_PORTAL_USER" },
        ),
        request,
      );
    }

    // A correct password clears the address counter, so someone who fumbled
    // their password a few times is not then locked out by their own success.
    // The per-account counter waits for the code: a password alone is not a
    // successful sign-in any more.
    resetRateLimit(key);

    if (!isLoginMfaEnabled()) {
      await completeSignIn(user, ip, false);
      return withCors(ok({ user: publicUser(user) }), request);
    }

    let enrolled: boolean;
    try {
      enrolled = Boolean(await readEnrollment(user.id));
    } catch (error) {
      if (!(error instanceof MfaUnreadableError)) throw error;
      console.error("[auth/login]", error.message);
      await recordSecurityEvent({ type: "mfa.failed", username: user.username, ip, detail: "kunci 2FA tidak bisa dibuka" });
      return withCors(
        fail("Verifikasi 2 langkah akun ini perlu diatur ulang. Hubungi admin portal.", 409, { code: "MFA_RESET_REQUIRED" }),
        request,
      );
    }

    const secret = enrolled ? undefined : generateTotpSecret();
    const stepId = beginPendingLogin(user, enrolled ? "verify" : "enroll", secret);
    const store = await cookies();
    store.set(PENDING_COOKIE, stepId, pendingCookieOptions(PENDING_TTL_MS / 1000));

    return withCors(
      ok({
        mfa: enrolled
          ? { mode: "verify" as const }
          : { mode: "enroll" as const, ...(await enrollmentView(user, secret!)) },
      }),
      request,
    );
  } catch (error) {
    if (error instanceof LdapUnavailableError) {
      // The person is told to call IT; IT needs to know why. The cause is the
      // TLS, socket or configuration error underneath — never the password.
      console.error("[auth/login] AD tidak bisa dihubungi:", error.message, error.cause);
      await recordSecurityEvent({ type: "login.unavailable", username, ip, detail: error.message });
      return withCors(
        fail("Server Active Directory tidak bisa dihubungi. Hubungi tim IT.", 503, {
          code: "AD_UNAVAILABLE",
        }),
        request,
      );
    }
    console.error("[auth/login]", error);
    return withCors(fail("Tidak bisa masuk saat ini. Coba lagi.", 500), request);
  }
}

function lockedResponse(retryAfterSeconds: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return fail(
    `Terlalu banyak percobaan gagal untuk akun ini. Akun dikunci sementara di portal; coba lagi dalam ${minutes} menit.`,
    429,
    { code: "ACCOUNT_LOCKED", retryAfter: retryAfterSeconds },
  );
}
