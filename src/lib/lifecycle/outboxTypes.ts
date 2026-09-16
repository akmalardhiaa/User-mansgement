import type { SealedPayload } from "./outboxCrypto";
import type { ApprovalStage } from "./types";

/**
 * The transactional outbox.
 *
 * The problem it solves: a request is submitted and an email must go out, but
 * those are two different systems and there is no transaction spanning them.
 * Sending inside the transaction means a slow provider holds a database lock
 * and a crash after sending loses the record; sending after means a crash
 * before sending loses the obligation entirely, and the request sits waiting on
 * somebody who was never told.
 *
 * So the obligation is committed WITH the state change, as a row, and a
 * dispatcher picks it up afterwards. A crash between the two costs a delay, not
 * a lost approval.
 *
 * What this cannot promise is exactly-once email. A timeout after the provider
 * accepted a message produces a duplicate on the retry, and no amount of
 * bookkeeping here prevents that — which is why the decision the email asks for
 * is idempotent and the token behind it is single-use. Two copies of a request
 * still yield one decision.
 */

export type OutboxKind = "approval.request" | "approval.result" | "request.rejected";

export type OutboxState = "PENDING" | "SENT" | "DEAD";

export interface OutboxEvent {
  eventId: string;
  kind: OutboxKind;
  /** The request this concerns, so the trail joins up end to end. */
  aggregateId: string;
  version: number;
  stage?: ApprovalStage;
  /** Where it is addressed. Kept in the clear: it is not a secret, and an operator needs it. */
  recipient: string;
  /**
   * The rendering inputs, including the raw approval token.
   *
   * Encrypted because of that token, and deleted the moment the message is
   * accepted or the token expires — the queue is not a place for a credential
   * to sit indefinitely.
   */
  sealedPayload?: SealedPayload;
  state: OutboxState;
  attempt: number;
  /** When the dispatcher may next try. Backoff lives here, not in a sleep. */
  nextAttemptAt: string;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  lastErrorKind?: string;
}

/**
 * What the provider said, kept apart from the business event.
 *
 * `acceptedAt` is the only timestamp here with a provider behind it. There is
 * deliberately no `deliveredAt`: nothing in this system ever learns that, and a
 * column for it would eventually be filled in by somebody who assumed 202 meant
 * the message arrived.
 */
export interface EmailDelivery {
  eventId: string;
  attempt: number;
  recipient: string;
  providerRef?: string;
  acceptedAt?: string;
  failedAt?: string;
  errorKind?: string;
  errorMessage?: string;
}

/**
 * When to try again, by attempt number: 1, 5, 15, 30, then 60 minutes.
 *
 * The plan's proposed ladder. Past the last rung the event is dead-lettered
 * rather than retried forever — an event nobody looks at is worse than one that
 * stops and says so.
 */
const BACKOFF_MINUTES = [1, 5, 15, 30, 60] as const;

export const MAX_SEND_ATTEMPTS = BACKOFF_MINUTES.length;

export function nextAttemptAfter(
  attempt: number,
  from: Date,
  retryAfterSeconds?: number,
): string {
  // A provider that told us when to come back is obeyed rather than guessed at:
  // ignoring Retry-After is how a rate limit becomes a longer rate limit.
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    return new Date(from.getTime() + retryAfterSeconds * 1000).toISOString();
  }

  const minutes = BACKOFF_MINUTES[Math.min(attempt, BACKOFF_MINUTES.length) - 1] ?? 60;
  // Jitter, so a provider coming back from an outage is not hit by every
  // pending message at the same instant.
  const jitter = Math.floor(Math.random() * 30_000);
  return new Date(from.getTime() + minutes * 60_000 + jitter).toISOString();
}

export function isExhausted(attempt: number): boolean {
  return attempt >= MAX_SEND_ATTEMPTS;
}
