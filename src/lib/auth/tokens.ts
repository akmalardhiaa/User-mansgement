import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * One-time tokens for email verification and password reset.
 *
 * 32 bytes from the OS CSPRNG — not Math.random(), whose output is predictable
 * from a few observed values, which would let anyone verify someone else's
 * address or take over their account by guessing the next token.
 */

/** Email verification links stay valid for a day, per the spec. */
export const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Reset links are deliberately shorter-lived than verification links: the
 * token is enough to take over an account, and reset mail is usually acted on
 * within minutes.
 */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export function createToken(): string {
  return randomBytes(32).toString("hex");
}

export function expiryFromNow(ttlMs: number): Date {
  return new Date(Date.now() + ttlMs);
}

/** True when `expires` is absent or already in the past. */
export function isExpired(expires: Date | null | undefined): boolean {
  return !expires || expires.getTime() <= Date.now();
}

/**
 * Constant-time token comparison, for the paths that compare in application
 * code rather than in an indexed database lookup.
 */
export function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
