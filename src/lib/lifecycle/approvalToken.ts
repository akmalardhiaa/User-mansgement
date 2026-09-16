import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { ApprovalStage } from "./types";

/**
 * The credential in an approval email.
 *
 * Worth being exact about what this is and is not. It is proof that somebody
 * holds a link that was sent to a specific mailbox for a specific stage of a
 * specific version of a specific request. It is NOT proof of who they are —
 * mail gets forwarded — which is why the plan pairs it with a verified
 * Microsoft identity and why the decision endpoint checks both.
 *
 * Four properties, each guarding a failure that has actually happened to
 * systems like this one:
 *
 *   - 32 CSPRNG bytes, so it cannot be guessed or enumerated.
 *   - Stored as a SHA-256 hash, so a leaked database is not a stack of usable
 *     approvals.
 *   - Single use, consumed in the same transaction as the decision, so a
 *     double-click or a replayed link cannot decide twice.
 *   - Bound to request, version and stage, so a manager's link cannot answer
 *     the CISO's question and a link issued for version 1 cannot approve
 *     version 2.
 *
 * The raw value exists in exactly two places: the email that carries it, and
 * the encrypted outbox payload waiting to be sent. Never in a response, a log,
 * an audit entry, or a reference number.
 */

export interface ApprovalTokenRecord {
  /** SHA-256 of the raw token, hex. The raw value is never stored here. */
  tokenHash: string;
  requestId: string;
  version: number;
  stage: ApprovalStage;
  expiresAt: string;
  consumedAt?: string;
  revokedAt?: string;
  revokedReason?: string;
  createdAt: string;
}

export interface IssuedToken {
  /** Handed to the email renderer, then discarded. */
  raw: string;
  record: ApprovalTokenRecord;
}

/** How long a link stays usable. The plan's starting value; HC and CISO set the final one. */
function ttlMs(): number {
  const hours = Number.parseInt(process.env.APPROVAL_TOKEN_TTL_HOURS ?? "", 10);
  return (Number.isFinite(hours) && hours > 0 ? hours : 24) * 60 * 60_000;
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function issueToken(
  requestId: string,
  version: number,
  stage: ApprovalStage,
  now = new Date(),
): IssuedToken {
  const raw = randomBytes(32).toString("base64url");

  return {
    raw,
    record: {
      tokenHash: hashToken(raw),
      requestId,
      version,
      stage,
      expiresAt: new Date(now.getTime() + ttlMs()).toISOString(),
      createdAt: now.toISOString(),
    },
  };
}

/** Compares digests without leaking, through timing, how much of a guess was right. */
export function hashEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export type TokenRejection =
  | "UNKNOWN"
  | "EXPIRED"
  | "CONSUMED"
  | "REVOKED"
  | "WRONG_STAGE"
  | "WRONG_VERSION";

export type TokenCheck =
  | { ok: true; record: ApprovalTokenRecord }
  | { ok: false; reason: TokenRejection };

/**
 * Whether a presented token may act on this stage of this version.
 *
 * Deliberately returns a reason rather than a boolean: an operator reading why
 * an approval was refused needs to tell "the link expired" from "somebody has
 * already answered this", and the two call for different responses.
 */
export function checkToken(
  records: readonly ApprovalTokenRecord[],
  raw: string,
  expected: { requestId: string; version: number; stage: ApprovalStage },
  now = new Date(),
): TokenCheck {
  const presented = hashToken(raw);
  const record = records.find(
    (candidate) =>
      candidate.requestId === expected.requestId && hashEquals(candidate.tokenHash, presented),
  );

  if (!record) return { ok: false, reason: "UNKNOWN" };
  if (record.revokedAt) return { ok: false, reason: "REVOKED" };
  if (record.consumedAt) return { ok: false, reason: "CONSUMED" };
  if (Date.parse(record.expiresAt) <= now.getTime()) return { ok: false, reason: "EXPIRED" };
  if (record.stage !== expected.stage) return { ok: false, reason: "WRONG_STAGE" };
  if (record.version !== expected.version) return { ok: false, reason: "WRONG_VERSION" };

  return { ok: true, record };
}

/**
 * Invalidates every live token for a request.
 *
 * Called when a request is revised, resent, or closed. A revision is the case
 * that matters: the old links were issued for text that no longer exists, and
 * leaving them usable would let somebody approve a version nobody is asking
 * about any more.
 */
export function revokeTokens(
  records: ApprovalTokenRecord[],
  requestId: string,
  reason: string,
  now = new Date(),
): number {
  let revoked = 0;
  for (const record of records) {
    if (record.requestId !== requestId) continue;
    if (record.consumedAt || record.revokedAt) continue;
    record.revokedAt = now.toISOString();
    record.revokedReason = reason;
    revoked += 1;
  }
  return revoked;
}
