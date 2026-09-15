import { createHash, randomBytes } from "node:crypto";

/**
 * Approval link tokens.
 *
 * The raw token only ever exists in the email. The database keeps its SHA-256
 * hash, so someone who can read the table — a backup, a replica, a leaked dump
 * — still cannot approve anything. SHA-256 rather than bcrypt is right here:
 * the input is 32 random bytes, so there is nothing to brute-force, and the
 * hash has to be an indexed lookup.
 */

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export function hashApprovalToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function createApprovalToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashApprovalToken(raw) };
}

/** Rejects anything that cannot be a token before it becomes a database query. */
export function isWellFormedToken(raw: unknown): raw is string {
  return typeof raw === "string" && TOKEN_PATTERN.test(raw);
}
