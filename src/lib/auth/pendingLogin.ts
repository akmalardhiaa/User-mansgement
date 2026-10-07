import { createHash, randomBytes } from "node:crypto";

import { processShared } from "@/lib/db/processShared";

import type { AdUser } from "./ad";
import { cookiesAreSecure } from "./session";

/**
 * The gap between a correct password and a correct code.
 *
 * The password step proves the person to AD and nothing more is granted: no
 * session exists until the code is right. What survives between the two steps
 * is this record, found by an id in a short-lived cookie scoped to /api/auth —
 * so a stolen password alone never reaches a page.
 *
 * In memory, not on disk: five minutes of state that a restart may simply
 * forget (the person types their password again), and a file of half-finished
 * sign-ins is not worth keeping. On globalThis, because the login and 2FA
 * routes are separate bundles (see processShared.ts).
 */

export const PENDING_COOKIE = "hc_login_step";
export const PENDING_TTL_MS = 5 * 60_000;
/** Wrong codes allowed in one attempt before the password must be typed again. */
export const PENDING_MAX_ATTEMPTS = 5;

export interface PendingLogin {
  user: AdUser;
  /** "enroll": first sign-in, a new secret is being confirmed. "verify": an enrolled phone. */
  mode: "enroll" | "verify";
  /** Only while enrolling: the secret shown in the QR code, not stored until confirmed. */
  secret?: string;
  expiresAt: number;
  attempts: number;
}

const pending = processShared("pending-logins", () => new Map<string, PendingLogin>());

function hash(id: string): string {
  return createHash("sha256").update(id).digest("hex");
}

function sweep(now: number): void {
  for (const [key, record] of pending) {
    if (record.expiresAt <= now) pending.delete(key);
  }
}

/** Starts the second step; returns the id for the cookie. */
export function beginPendingLogin(
  user: AdUser,
  mode: PendingLogin["mode"],
  secret: string | undefined,
  now: number = Date.now(),
): string {
  sweep(now);
  // One half-finished sign-in per person: a second password entry replaces the
  // first, so an abandoned QR code stops being valid.
  for (const [key, record] of pending) {
    if (record.user.id === user.id) pending.delete(key);
  }
  const id = randomBytes(32).toString("base64url");
  pending.set(hash(id), { user, mode, secret, expiresAt: now + PENDING_TTL_MS, attempts: 0 });
  return id;
}

export function findPendingLogin(id: string | undefined, now: number = Date.now()): PendingLogin | undefined {
  if (!id) return undefined;
  sweep(now);
  return pending.get(hash(id));
}

/** Counts a wrong code; true when that was the last one allowed and the step is gone. */
export function failPendingLogin(id: string): boolean {
  const key = hash(id);
  const record = pending.get(key);
  if (!record) return true;
  record.attempts += 1;
  if (record.attempts >= PENDING_MAX_ATTEMPTS) {
    pending.delete(key);
    return true;
  }
  return false;
}

export function endPendingLogin(id: string | undefined): void {
  if (id) pending.delete(hash(id));
}

/** Cookie for the step. Strict: it is only ever sent by this site's own login form. */
export function pendingCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: cookiesAreSecure(),
    path: "/api/auth",
    maxAge: maxAgeSeconds,
  };
}

/** Test seam. */
export function resetPendingLogins(): void {
  pending.clear();
}
