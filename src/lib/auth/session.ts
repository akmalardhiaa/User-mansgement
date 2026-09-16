import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { PortalRole } from "./roles";
import { mutateSessions, readSessions, type SessionRecord } from "./sessionStore";

/**
 * Server-side sessions.
 *
 * This replaces the previous JWT. The difference that matters is revocation: a
 * signed token is a bearer credential that stays valid until it expires, no
 * matter what happens to the account behind it, so logging out, losing a role,
 * or being deactivated could not actually end a session — it could only stop
 * the browser from volunteering one. Every check here reads the stored record,
 * so a revoked session stops working on the very next request.
 *
 * The cookie carries an opaque random id. The store keeps only its SHA-256, so
 * the session file is not itself a set of usable credentials.
 *
 * Three independent clocks end a session:
 *   - absolute expiry, a ceiling no amount of activity extends;
 *   - idle expiry, which activity does push forward, up to that ceiling;
 *   - revocation, which is immediate.
 *
 * The two timeouts default to eight hours and thirty minutes. Those are
 * starting values for the demo, not policy: the plan leaves the final numbers
 * to HC and the CISO, which is why they are configuration.
 */

export const SESSION_COOKIE = "hc_session";

function minutes(name: string, fallback: number): number {
  const raw = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function absoluteTtlMs(): number {
  return minutes("SESSION_ABSOLUTE_TTL_MINUTES", 8 * 60) * 60_000;
}

function idleTtlMs(): number {
  return minutes("SESSION_IDLE_TTL_MINUTES", 30) * 60_000;
}

/**
 * How stale `lastSeenAt` may get before a read bothers to write.
 *
 * Without this, every request would rewrite the session file just to move a
 * timestamp. The cost of the throttle is that idle expiry is accurate to within
 * a minute, which is immaterial against a thirty-minute window.
 */
const TOUCH_THROTTLE_MS = 60_000;

export interface PortalSession {
  /** Stable identifier of the person — the AD sAMAccountName. */
  userId: string;
  username: string;
  email: string;
  fullName: string;
  roles: PortalRole[];
  department?: string;
  createdAt: string;
  absoluteExpiresAt: string;
}

export interface NewSessionInput {
  userId: string;
  username: string;
  email: string;
  fullName: string;
  roles: PortalRole[];
  department?: string;
}

function hashId(id: string): string {
  return createHash("sha256").update(id).digest("hex");
}

function toSession(record: SessionRecord): PortalSession {
  return {
    userId: record.userId,
    username: record.username,
    email: record.email,
    fullName: record.fullName,
    roles: record.roles,
    department: record.department,
    createdAt: record.createdAt,
    absoluteExpiresAt: record.absoluteExpiresAt,
  };
}

function isLive(record: SessionRecord, now: number): boolean {
  if (record.revokedAt) return false;
  return Date.parse(record.absoluteExpiresAt) > now && Date.parse(record.idleExpiresAt) > now;
}

/**
 * Compares two hashes without leaking, through timing, how much of a guess was
 * right. Both are hex digests of the same length, so a length mismatch is
 * already a mismatch and short-circuiting on it reveals nothing.
 */
function hashEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/**
 * Starts a session and returns the id to put in the cookie.
 *
 * Any live session the same person already holds is revoked first when their
 * roles have changed since — a demotion has to take effect everywhere the
 * person is signed in, not just where they sign in next.
 */
export async function createSession(input: NewSessionInput): Promise<{
  id: string;
  maxAgeSeconds: number;
}> {
  // 32 bytes from the CSPRNG. Guessing one is not a threat model this has to
  // think about further.
  const id = randomBytes(32).toString("base64url");
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const absoluteExpiresAt = new Date(now + absoluteTtlMs()).toISOString();

  await mutateSessions((sessions) => {
    for (const record of sessions) {
      if (record.userId !== input.userId || !isLive(record, now)) continue;
      if (sameRoles(record.roles, input.roles)) continue;
      record.revokedAt = nowIso;
      record.revokedReason = "roles-changed";
    }

    sessions.push({
      idHash: hashId(id),
      userId: input.userId,
      username: input.username,
      email: input.email,
      fullName: input.fullName,
      roles: input.roles,
      department: input.department,
      createdAt: nowIso,
      absoluteExpiresAt,
      idleExpiresAt: new Date(now + idleTtlMs()).toISOString(),
      lastSeenAt: nowIso,
    });

    // Anything long dead is dropped on the way past, so the file cannot grow
    // without bound on a long-lived host.
    prune(sessions, now);
  });

  return { id, maxAgeSeconds: Math.floor(absoluteTtlMs() / 1000) };
}

function sameRoles(a: readonly PortalRole[], b: readonly PortalRole[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((role, index) => role === right[index]);
}

/** Drops records that expired more than a day ago. */
function prune(sessions: SessionRecord[], now: number): void {
  const cutoff = now - 24 * 60 * 60_000;
  const keep = sessions.filter((record) => Date.parse(record.absoluteExpiresAt) > cutoff);
  if (keep.length !== sessions.length) sessions.splice(0, sessions.length, ...keep);
}

/**
 * Resolves a cookie value to the session behind it, or undefined.
 *
 * This is the authoritative check — the one every guarded handler and every
 * server component goes through. It reads the record rather than trusting a
 * claim, which is the whole reason this module exists.
 */
export async function resolveSession(id: string | undefined): Promise<PortalSession | undefined> {
  if (!id) return undefined;

  const now = Date.now();
  const idHash = hashId(id);
  const sessions = await readSessions();
  const record = sessions.find((candidate) => hashEquals(candidate.idHash, idHash));

  if (!record || !isLive(record, now)) return undefined;

  // Idle expiry only moves forward if the record is already stale enough to be
  // worth a write; see TOUCH_THROTTLE_MS.
  if (now - Date.parse(record.lastSeenAt) > TOUCH_THROTTLE_MS) {
    await touch(idHash, now);
  }

  return toSession(record);
}

async function touch(idHash: string, now: number): Promise<void> {
  await mutateSessions((sessions) => {
    const record = sessions.find((candidate) => candidate.idHash === idHash);
    if (!record || record.revokedAt) return;

    const nowIso = new Date(now).toISOString();
    record.lastSeenAt = nowIso;
    // Never past the absolute ceiling: activity extends an idle window, it does
    // not buy a longer session.
    const extended = Math.min(now + idleTtlMs(), Date.parse(record.absoluteExpiresAt));
    record.idleExpiresAt = new Date(extended).toISOString();
  });
}

/** Ends one session — what logout calls. */
export async function revokeSession(id: string | undefined, reason = "logout"): Promise<void> {
  if (!id) return;
  const idHash = hashId(id);
  await mutateSessions((sessions) => {
    const record = sessions.find((candidate) => candidate.idHash === idHash);
    if (record && !record.revokedAt) {
      record.revokedAt = new Date().toISOString();
      record.revokedReason = reason;
    }
  });
}

/** Ends every session a person holds — deactivation, or a forced sign-out. */
export async function revokeSessionsForUser(userId: string, reason: string): Promise<number> {
  const now = Date.now();
  return mutateSessions((sessions) => {
    let revoked = 0;
    for (const record of sessions) {
      if (record.userId !== userId || !isLive(record, now)) continue;
      record.revokedAt = new Date(now).toISOString();
      record.revokedReason = reason;
      revoked += 1;
    }
    return revoked;
  });
}

/**
 * Cookie attributes.
 *
 * httpOnly keeps the id away from injected script; sameSite=lax stops another
 * origin's form post riding the session. `secure` is on outside development,
 * where there is no HTTPS to attach it to.
 */
export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
