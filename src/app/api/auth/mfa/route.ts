import { cookies } from "next/headers";

import { completeSignIn, publicUser } from "@/lib/auth/loginFlow";
import { LOGIN_LOCK_MINUTES, accountLock, recordLoginFailure } from "@/lib/auth/loginThrottle";
import { MfaUnreadableError, consumeStep, readEnrollment, saveEnrollment } from "@/lib/auth/mfa";
import {
  PENDING_COOKIE,
  endPendingLogin,
  failPendingLogin,
  findPendingLogin,
  pendingCookieOptions,
} from "@/lib/auth/pendingLogin";
import { recordSecurityEvent } from "@/lib/auth/securityLog";
import { matchTotp } from "@/lib/auth/totp";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { preflight, withCors } from "@/lib/http/cors";
import { clientAddress } from "@/lib/http/rateLimit";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/**
 * POST /api/auth/mfa — { code }.
 *
 * Step two of two, after a correct password: the six digits from the person's
 * authenticator app. On a first sign-in the same request confirms the phone
 * that scanned the QR code, and only then is its secret stored — a QR code
 * scanned and abandoned enrolls nothing.
 *
 * Wrong codes count three ways: against this attempt (five, then the password
 * again), against the account's lock (loginThrottle.ts), and in the log.
 */
export async function POST(request: Request) {
  const ip = clientAddress(request);
  const store = await cookies();
  const stepId = store.get(PENDING_COOKIE)?.value;
  const pending = findPendingLogin(stepId);

  if (!stepId || !pending) {
    return withCors(
      fail("Langkah verifikasi sudah kedaluwarsa. Silakan masuk lagi.", 401, { code: "MFA_EXPIRED" }),
      request,
    );
  }

  const { user } = pending;
  const lock = accountLock(user.username);
  if (lock.locked) {
    endPendingLogin(stepId);
    store.set(PENDING_COOKIE, "", pendingCookieOptions(0));
    return withCors(
      fail(
        `Terlalu banyak percobaan gagal untuk akun ini. Coba lagi dalam ${Math.max(1, Math.ceil(lock.retryAfter / 60))} menit.`,
        429,
        { code: "ACCOUNT_LOCKED", retryAfter: lock.retryAfter },
      ),
      request,
    );
  }

  const body = (await readJson(request)) as { code?: unknown } | undefined;
  const code = typeof body?.code === "string" ? body.code : "";

  let accepted = false;
  let reused = false;
  try {
    if (pending.mode === "enroll") {
      const step = matchTotp(pending.secret!, code);
      if (step !== undefined) {
        accepted = await saveEnrollment(user.id, pending.secret!, step);
        if (accepted) {
          await recordSecurityEvent({ type: "mfa.enrolled", username: user.username, ip, detail: "authenticator terdaftar" });
        }
      }
    } else {
      const enrollment = await readEnrollment(user.id);
      const step = enrollment ? matchTotp(enrollment.secret, code) : undefined;
      if (step !== undefined) {
        accepted = await consumeStep(user.id, step);
        reused = !accepted;
      }
    }
  } catch (error) {
    if (!(error instanceof MfaUnreadableError)) throw error;
    console.error("[auth/mfa]", error.message);
    endPendingLogin(stepId);
    store.set(PENDING_COOKIE, "", pendingCookieOptions(0));
    return withCors(
      fail("Verifikasi 2 langkah akun ini perlu diatur ulang. Hubungi admin portal.", 409, { code: "MFA_RESET_REQUIRED" }),
      request,
    );
  }

  if (!accepted) {
    const exhausted = failPendingLogin(stepId);
    const nowLocked = recordLoginFailure(user.username);
    await recordSecurityEvent({
      type: nowLocked ? "login.locked" : "mfa.failed",
      username: user.username,
      ip,
      detail: reused
        ? "kode sudah pernah dipakai"
        : nowLocked
          ? `kode 2FA salah; akun dikunci ${LOGIN_LOCK_MINUTES} menit`
          : "kode 2FA salah",
    });

    if (exhausted || nowLocked) {
      endPendingLogin(stepId);
      store.set(PENDING_COOKIE, "", pendingCookieOptions(0));
      return withCors(
        fail(
          nowLocked
            ? `Terlalu banyak percobaan gagal. Akun dikunci sementara di portal; coba lagi dalam ${LOGIN_LOCK_MINUTES} menit.`
            : "Terlalu banyak kode salah. Silakan masuk lagi dari awal.",
          nowLocked ? 429 : 401,
          { code: nowLocked ? "ACCOUNT_LOCKED" : "MFA_EXPIRED" },
        ),
        request,
      );
    }

    return withCors(
      fail(
        reused
          ? "Kode ini sudah dipakai. Tunggu kode berikutnya muncul di aplikasi, lalu coba lagi."
          : "Kode salah. Pastikan jam di HP sudah otomatis (sinkron), lalu masukkan kode yang sedang tampil.",
        401,
        { code: "MFA_INVALID" },
      ),
      request,
    );
  }

  endPendingLogin(stepId);
  await completeSignIn(user, ip, true);
  return withCors(ok({ user: publicUser(user) }), request);
}
