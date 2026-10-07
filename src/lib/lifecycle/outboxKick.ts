import { processShared } from "@/lib/db/processShared";

/**
 * "There is mail in the outbox now" — so it goes out in a second, not at the
 * next poll.
 *
 * The scheduler polls every OUTBOX_POLL_SECONDS, which left a manager waiting
 * up to half a minute for an approval email HC had just sent. The poll stays:
 * it is what retries a failed delivery and what picks up mail after a restart.
 * This only adds a nudge when something is queued.
 *
 * A registry rather than an import, for two reasons. The store is what notices
 * new mail, and it should not depend on the scheduler. And the scheduler is
 * started by instrumentation while mail is queued from route handlers, which
 * run different copies of these modules — so the hook lives on globalThis (see
 * processShared), where both copies find the same one.
 */
const holder = processShared("outbox-kick", () => ({ kick: undefined as (() => void) | undefined }));

export function registerOutboxKick(kick: (() => void) | undefined): void {
  holder.kick = kick;
}

/** Does nothing when no scheduler is running — the poll is switched off, or this is a test. */
export function requestOutboxDispatch(): void {
  holder.kick?.();
}
