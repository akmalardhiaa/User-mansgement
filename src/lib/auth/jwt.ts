import jwt from "jsonwebtoken";

import { getJwtSecret } from "@/lib/config/authEnv";

import { isRole, type AccessTokenPayload } from "./types";

/**
 * Access tokens.
 *
 * Short-lived by design (15 minutes by default, per JWT_EXPIRES_IN). A JWT
 * cannot be revoked before it expires — there is no server-side session list
 * to delete from — so the window in which a stolen or stale token still works
 * is exactly its lifetime. Keep it short; proxy.ts renews it silently so a
 * short lifetime does not mean logging people out mid-task.
 */

export const DEFAULT_EXPIRES_IN = "15m";

export const TOKEN_COOKIE = "hc_token";

function expiresIn(): string {
  return process.env.JWT_EXPIRES_IN?.trim() || DEFAULT_EXPIRES_IN;
}

export interface TokenSubject {
  id: string;
  email: string;
  fullName: string;
  role: AccessTokenPayload["role"];
}

/** Signs a new access token for a user. */
export function createAccessToken(user: TokenSubject): string {
  return jwt.sign(
    { email: user.email, fullName: user.fullName, role: user.role },
    getJwtSecret(),
    { subject: user.id, expiresIn: expiresIn() as jwt.SignOptions["expiresIn"] },
  );
}

/**
 * Verifies signature and expiry.
 *
 * Returns undefined for anything it cannot fully trust — a bad signature, an
 * expired token, or a payload missing a claim the app relies on — so callers
 * only ever see a trustworthy payload or none at all, and can never
 * accidentally treat an unverified token as a session.
 */
export function verifyAccessToken(token: string | undefined): AccessTokenPayload | undefined {
  if (!token) return undefined;

  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (typeof payload === "string") return undefined;

    const { sub, email, fullName, role, iat, exp } = payload;
    if (typeof sub !== "string" || !sub) return undefined;
    if (typeof email !== "string" || !email) return undefined;
    if (typeof fullName !== "string") return undefined;
    if (!isRole(role)) return undefined;
    if (typeof iat !== "number" || typeof exp !== "number") return undefined;

    return { sub, email, fullName, role, iat, exp };
  } catch {
    // Covers JsonWebTokenError (bad signature), TokenExpiredError, and a
    // missing JWT_SECRET. None of them should surface as a 500 to the caller.
    return undefined;
  }
}

/**
 * Reads the claims WITHOUT checking the signature.
 *
 * Only for inspecting a token the app has already rejected — logging why a
 * session ended, or telling a client its token expired. Never branch on this
 * for access control: the payload is attacker-controlled until verified.
 */
export function decodeAccessToken(token: string | undefined): Record<string, unknown> | undefined {
  if (!token) return undefined;
  try {
    const decoded = jwt.decode(token);
    return decoded && typeof decoded === "object" ? (decoded as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** True once a token is past the halfway point of its life — time to reissue. */
export function isHalfExpired(payload: AccessTokenPayload): boolean {
  const lifetime = payload.exp - payload.iat;
  if (lifetime <= 0) return false;
  const elapsed = Math.floor(Date.now() / 1000) - payload.iat;
  return elapsed > lifetime / 2;
}

/** Seconds until the token expires, floored at zero. */
export function secondsUntilExpiry(payload: AccessTokenPayload): number {
  return Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
}

/**
 * Cookie attributes for the token.
 *
 * httpOnly keeps it out of reach of injected scripts: an XSS bug can then act
 * as the user while the page is open, but cannot copy the token out and keep
 * using it afterwards. sameSite=lax stops another origin's form post from
 * riding the session.
 */
export function tokenCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
