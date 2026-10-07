import { processShared } from "@/lib/db/processShared";

/**
 * Failed sign-ins counted per account, not per address.
 *
 * The per-address limit in the login route keys on X-Forwarded-For, which the
 * client writes when nothing in front of the portal overwrites it. A script
 * sending a different made-up address with every attempt was never limited at
 * all — and every one of those wrong passwords also counts towards the
 * domain's own lockout, so the portal could be used to lock real people out of
 * Windows. The account name is the one thing such a script cannot vary while
 * still attacking the same account.
 *
 * Wrong passwords and wrong 2FA codes both count. After MAX_FAILURES within
 * WINDOW the account is refused here for LOCK, before AD is asked — so the
 * domain's lockout is not reached through this portal. A correct sign-in clears
 * the count.
 *
 * The cost, accepted: somebody can keep a colleague out of the portal for a
 * quarter of an hour by typing wrong passwords under their name. Their Windows
 * login is not affected, and the attempts are in the security log.
 */

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;

interface Counter {
  failures: number;
  firstAt: number;
  lockedUntil?: number;
}

// On globalThis: the login and 2FA routes are separate bundles and must count
// on the same counter. See processShared.ts.
const counters = processShared("login-throttle", () => new Map<string, Counter>());

/** "CORP\ayu", "ayu@corp.example" and "Ayu" are one account. */
export function accountKey(username: string): string {
  return username.trim().split("\\").pop()!.split("@")[0].toLowerCase();
}

export interface LockState {
  locked: boolean;
  /** Seconds until the lock lifts, when locked. */
  retryAfter: number;
}

export function accountLock(username: string, now: number = Date.now()): LockState {
  const counter = counters.get(accountKey(username));
  if (counter?.lockedUntil && counter.lockedUntil > now) {
    return { locked: true, retryAfter: Math.ceil((counter.lockedUntil - now) / 1000) };
  }
  return { locked: false, retryAfter: 0 };
}

/** Counts one failure; true when this one locked the account. */
export function recordLoginFailure(username: string, now: number = Date.now()): boolean {
  const key = accountKey(username);
  let counter = counters.get(key);
  if (!counter || now - counter.firstAt > WINDOW_MS || (counter.lockedUntil && counter.lockedUntil <= now)) {
    counter = { failures: 0, firstAt: now };
    counters.set(key, counter);
  }
  counter.failures += 1;
  if (counter.failures >= MAX_FAILURES && !counter.lockedUntil) {
    counter.lockedUntil = now + LOCK_MS;
    return true;
  }
  return false;
}

export function clearLoginFailures(username: string): void {
  counters.delete(accountKey(username));
}

/** Test seam. */
export function resetLoginThrottle(): void {
  counters.clear();
}

export const LOGIN_LOCK_MINUTES = LOCK_MS / 60_000;
