import type { ActorIdentity } from "./types";

/**
 * Delegation: a manager's approvals, handed to someone else for a while.
 *
 * It exists because the manager stage goes to exactly one person, and people
 * go on leave. Without it, every request for that manager's team sits in
 * PENDING_MANAGER until they come back.
 *
 * It is also, by construction, a sanctioned way to change who approves — which
 * is why it is narrow:
 *
 *   - Always time-bound, and never longer than MAX_DAYS.
 *   - The substitute must be an active person in the directory. Never a typed
 *     address; that would reopen the hole the manager picker just closed.
 *   - Exactly one hop. A substitute who is away themselves is refused, and so is
 *     someone who is currently covering for another manager: authority that can
 *     hop A → B → C ends up somewhere nobody chose.
 *   - Recorded as "B, on behalf of A" on the request, in the email, and in the
 *     audit trail — never as though A had decided.
 *   - Registered by HC. Managers do not sign in to the portal.
 *
 * Only the manager stage is delegable. The CISO stage already goes to a team,
 * which is its own answer to somebody being away.
 */

export interface Delegation {
  id: string;
  /** The manager who is away. */
  from: ActorIdentity;
  /** Who answers in their place. An active directory employee. */
  to: ActorIdentity;
  /** Inclusive, from 00:00 Asia/Jakarta on the first day. */
  startsAt: string;
  /** Inclusive, to the end of the last day, Asia/Jakarta. */
  endsAt: string;
  reason: string;
  createdBy: ActorIdentity;
  createdAt: string;
  /** Set when HC ends it before `endsAt`. */
  endedAt?: string;
  endedBy?: ActorIdentity;
}

export const MAX_DELEGATION_DAYS = 90;

/** Local calendar days, interpreted in the company's timezone. */
export function dayStart(date: string): string {
  return new Date(`${date}T00:00:00.000+07:00`).toISOString();
}

export function dayEnd(date: string): string {
  return new Date(`${date}T23:59:59.999+07:00`).toISOString();
}

function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** When a delegation actually stops: its end date, or when HC ended it. */
export function effectiveEnd(delegation: Delegation): string {
  return delegation.endedAt && delegation.endedAt < delegation.endsAt
    ? delegation.endedAt
    : delegation.endsAt;
}

export function isActiveAt(delegation: Delegation, at: Date): boolean {
  const now = at.toISOString();
  return delegation.startsAt <= now && now <= effectiveEnd(delegation);
}

export type DelegationState = "UPCOMING" | "ACTIVE" | "ENDED";

export function stateOf(delegation: Delegation, at: Date): DelegationState {
  const now = at.toISOString();
  if (now > effectiveEnd(delegation)) return "ENDED";
  return delegation.startsAt > now ? "UPCOMING" : "ACTIVE";
}

/** The delegation covering this manager right now, if any. One hop, never more. */
export function activeDelegationFor(
  delegations: readonly Delegation[],
  managerEmail: string,
  at: Date,
): Delegation | undefined {
  return delegations.find(
    (delegation) => sameAddress(delegation.from.email, managerEmail) && isActiveAt(delegation, at),
  );
}

function overlaps(a: { startsAt: string; endsAt: string }, b: Delegation): boolean {
  return a.startsAt <= effectiveEnd(b) && b.startsAt <= a.endsAt;
}

/**
 * Why a proposed delegation may not exist, or undefined if it may.
 *
 * Pure, so the rules can be read — and tested — in one place.
 */
export function refusalFor(
  proposed: { from: ActorIdentity; to: ActorIdentity; startsAt: string; endsAt: string },
  existing: readonly Delegation[],
  at: Date,
): string | undefined {
  if (sameAddress(proposed.from.email, proposed.to.email)) {
    return "Manager tidak bisa mendelegasikan kepada dirinya sendiri.";
  }
  if (proposed.endsAt < proposed.startsAt) {
    return "Tanggal selesai tidak boleh sebelum tanggal mulai.";
  }
  if (proposed.endsAt < at.toISOString()) {
    return "Delegasi yang sudah lewat tidak bisa dibuat.";
  }
  const days = (Date.parse(proposed.endsAt) - Date.parse(proposed.startsAt)) / 86_400_000;
  if (days > MAX_DELEGATION_DAYS) {
    return `Delegasi paling lama ${MAX_DELEGATION_DAYS} hari. Untuk ketidakhadiran lebih lama, perbarui manager di direktori.`;
  }

  const live = existing.filter((delegation) => stateOf(delegation, at) !== "ENDED");

  if (live.some((d) => sameAddress(d.from.email, proposed.from.email) && overlaps(proposed, d))) {
    return `${proposed.from.name} sudah punya delegasi pada periode itu. Akhiri yang lama dulu.`;
  }
  // No chains, in either direction.
  if (live.some((d) => sameAddress(d.from.email, proposed.to.email) && overlaps(proposed, d))) {
    return `${proposed.to.name} sendiri sedang didelegasikan pada periode itu, jadi tidak bisa menjadi pengganti.`;
  }
  if (live.some((d) => sameAddress(d.to.email, proposed.from.email) && overlaps(proposed, d))) {
    return `${proposed.from.name} sedang menjadi pengganti manager lain pada periode itu. Delegasi berantai tidak diizinkan — ubah delegasi yang itu dulu.`;
  }
  return undefined;
}
