import { getEmailDriver } from "@/lib/email";
import { EmailError } from "@/lib/email/types";
import { mutateStore, readStore } from "@/lib/db/store";

import { open } from "./outboxCrypto";
import { isExhausted, nextAttemptAfter, type OutboxEvent } from "./outboxTypes";
import type { ApprovalMailPayload } from "./outbox";
import { renderEmail } from "./renderEmail";

/**
 * Sending what the outbox owes.
 *
 * Runs after the transaction that committed the obligation, which is what makes
 * the whole arrangement safe: a crash before this point costs a delay, and a
 * crash after a send costs at worst a duplicate.
 *
 * Duplicates are possible and are not pretended otherwise. A timeout after the
 * provider accepted a message leaves no way to know, and the retry sends it
 * again. What makes that acceptable is downstream: the link is single-use and
 * the decision is idempotent, so two copies of an email still produce one
 * decision.
 *
 * The other thing this is careful about: `accepted` is recorded, `delivered` is
 * not. A provider taking a message says it will try. Nothing here ever learns
 * whether it arrived, and a dashboard claiming otherwise would be inventing it.
 */

export interface DispatchOutcome {
  eventId: string;
  recipient: string;
  outcome: "ACCEPTED" | "RETRY" | "DEAD";
  error?: string;
}

export interface DispatchReport {
  attempted: number;
  accepted: number;
  retried: number;
  dead: number;
  outcomes: DispatchOutcome[];
}

/** Takes one due event and counts the attempt, atomically. */
async function claimNext(at: Date): Promise<OutboxEvent | undefined> {
  return mutateStore((draft) => {
    const due = draft.outboxEvents.find(
      (event) => event.state === "PENDING" && Date.parse(event.nextAttemptAt) <= at.getTime(),
    );
    if (!due) return undefined;

    // Counted before sending, not after. A crash mid-send must not leave an
    // event that looks untried and gets sent forever.
    due.attempt += 1;
    due.updatedAt = at.toISOString();
    return structuredClone(due);
  });
}

async function recordAccepted(
  event: OutboxEvent,
  providerRef: string,
  acceptedAt: string,
): Promise<void> {
  await mutateStore((draft) => {
    const stored = draft.outboxEvents.find((candidate) => candidate.eventId === event.eventId);
    if (!stored) return;

    stored.state = "SENT";
    stored.updatedAt = acceptedAt;
    /*
     * The sealed payload goes now.
     *
     * It holds a usable approval token, and the message that needed it has been
     * handed over. Keeping it would turn the queue into a store of live
     * credentials with no purpose left to serve.
     */
    delete stored.sealedPayload;

    draft.emailDeliveries.push({
      eventId: event.eventId,
      attempt: event.attempt,
      recipient: event.recipient,
      providerRef,
      acceptedAt,
    });
  });
}

async function recordFailure(
  event: OutboxEvent,
  at: Date,
  failure: { kind: string; message: string; retryable: boolean; retryAfterSeconds?: number },
): Promise<"RETRY" | "DEAD"> {
  return mutateStore((draft) => {
    const stored = draft.outboxEvents.find((candidate) => candidate.eventId === event.eventId);
    if (!stored) return "DEAD" as const;

    draft.emailDeliveries.push({
      eventId: event.eventId,
      attempt: event.attempt,
      recipient: event.recipient,
      failedAt: at.toISOString(),
      errorKind: failure.kind,
      errorMessage: failure.message,
    });

    stored.lastError = failure.message;
    stored.lastErrorKind = failure.kind;
    stored.updatedAt = at.toISOString();

    const giveUp = !failure.retryable || isExhausted(event.attempt);

    if (giveUp) {
      stored.state = "DEAD";
      // A dead event's token has no future either.
      delete stored.sealedPayload;
      return "DEAD" as const;
    }

    stored.nextAttemptAt = nextAttemptAfter(event.attempt, at, failure.retryAfterSeconds);
    return "RETRY" as const;
  });
}

export async function dispatchDueEmails(
  options: { now?: Date; limit?: number } = {},
): Promise<DispatchReport> {
  const at = options.now ?? new Date();
  const limit = Math.min(Math.max(1, options.limit ?? 25), 100);
  const driver = getEmailDriver();

  const outcomes: DispatchOutcome[] = [];

  for (let i = 0; i < limit; i += 1) {
    const event = await claimNext(at);
    if (!event) break;

    if (!event.sealedPayload) {
      // Nothing left to render from. Not retryable — the payload is deleted
      // exactly once, when the message was accepted or abandoned.
      const result = await recordFailure(event, at, {
        kind: "PAYLOAD",
        message: "Payload outbox sudah tidak ada, pesan tidak dapat dirender ulang.",
        retryable: false,
      });
      outcomes.push({ eventId: event.eventId, recipient: event.recipient, outcome: result });
      continue;
    }

    let payload: ApprovalMailPayload;
    try {
      payload = JSON.parse(open(event.sealedPayload)) as ApprovalMailPayload;
    } catch {
      // A rotated or wrong key. Retrying cannot help, and it must be visible
      // rather than looping quietly.
      const result = await recordFailure(event, at, {
        kind: "PAYLOAD",
        message: "Payload outbox tidak dapat didekripsi. Periksa OUTBOX_ENCRYPTION_KEY.",
        retryable: false,
      });
      outcomes.push({ eventId: event.eventId, recipient: event.recipient, outcome: result });
      continue;
    }

    try {
      const acceptance = await driver.send(renderEmail(payload, event.recipient));
      await recordAccepted(event, acceptance.providerRef, acceptance.acceptedAt);
      outcomes.push({ eventId: event.eventId, recipient: event.recipient, outcome: "ACCEPTED" });
    } catch (error) {
      const failure =
        error instanceof EmailError
          ? {
              kind: error.kind,
              message: error.message,
              retryable: error.retryable,
              retryAfterSeconds: error.retryAfterSeconds,
            }
          : {
              kind: "UNKNOWN",
              message: error instanceof Error ? error.message : String(error),
              retryable: false,
            };

      const result = await recordFailure(event, at, failure);
      outcomes.push({
        eventId: event.eventId,
        recipient: event.recipient,
        outcome: result,
        error: failure.message,
      });
    }
  }

  return {
    attempted: outcomes.length,
    accepted: outcomes.filter((outcome) => outcome.outcome === "ACCEPTED").length,
    retried: outcomes.filter((outcome) => outcome.outcome === "RETRY").length,
    dead: outcomes.filter((outcome) => outcome.outcome === "DEAD").length,
    outcomes,
  };
}

/** Delivery attempts for one request, for the detail screen. */
export async function deliveriesForRequest(requestId: string) {
  const { outboxEvents, emailDeliveries } = await readStore();
  const ids = new Set(
    outboxEvents.filter((event) => event.aggregateId === requestId).map((event) => event.eventId),
  );

  return {
    events: outboxEvents.filter((event) => event.aggregateId === requestId),
    deliveries: emailDeliveries.filter((delivery) => ids.has(delivery.eventId)),
  };
}
