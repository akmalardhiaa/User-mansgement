import { clearInterval, setInterval, setTimeout } from "node:timers";

import { EmailConfigurationError } from "@/lib/email";

import { dispatchDueEmails, type DispatchReport } from "./dispatcher";

/**
 * Sending what the outbox owes, without anybody pressing anything.
 *
 * Submitting a request commits the obligation to send in the same transaction
 * as the status change, but committing a row is not sending it. Until something
 * runs the dispatcher, an approval email sits PENDING while the request waits on
 * somebody who was never told — and the retry ladder is decorative, because a
 * RETRY event schedules a next attempt that nobody comes for.
 *
 * This is the something, for a single host.
 *
 * It is deliberately NOT the answer for a multi-instance deployment. The store's
 * lock (see db/store.ts) serialises read-modify-write within one process; across
 * processes there is none, so N replicas each polling the same file are N racing
 * writers. Production therefore has to opt in explicitly, and the honest answer
 * there is an external scheduler calling POST /api/outbox/dispatch.
 */

/** Frequent enough that a demo feels immediate, slow enough to stay quiet. */
const DEFAULT_DEV_SECONDS = 30;

/**
 * Below this the loop spends more time contending for the store lock than
 * sending. Refused rather than clamped: silently running at a different rate
 * than the one configured is how somebody debugs the wrong thing for an hour.
 */
const MINIMUM_SECONDS = 5;

/** How often to poll, or undefined when the loop is deliberately off. */
export function resolvePollSeconds(
  raw: string | undefined,
  production: boolean,
): number | undefined {
  const value = raw?.trim();

  if (!value) {
    return production ? undefined : DEFAULT_DEV_SECONDS;
  }

  if (value === "0" || value.toLowerCase() === "off") return undefined;

  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds < 0) {
    throw new EmailConfigurationError(
      `OUTBOX_POLL_SECONDS="${value}" bukan bilangan bulat detik. Isi 0 untuk mematikan.`,
    );
  }
  if (seconds < MINIMUM_SECONDS) {
    throw new EmailConfigurationError(
      `OUTBOX_POLL_SECONDS=${seconds} terlalu rapat; minimal ${MINIMUM_SECONDS} detik.`,
    );
  }

  return seconds;
}

export interface SchedulerDeps {
  dispatch: () => Promise<DispatchReport>;
  log: (message: string) => void;
  onError: (message: string, error: unknown) => void;
}

export interface OutboxScheduler {
  start: () => void;
  stop: () => void;
  /** One pass. Exposed so the loop's behaviour is testable without timers. */
  tick: () => Promise<void>;
}

export function createOutboxScheduler(intervalMs: number, deps: SchedulerDeps): OutboxScheduler {
  let inFlight = false;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  function stop(): void {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = undefined;
  }

  async function tick(): Promise<void> {
    /*
     * Single-flight. A run may take a while — Graph allows fifteen seconds per
     * message and a pass handles up to twenty-five — so without this the next
     * tick starts while the last is still working the same queue.
     */
    if (inFlight || stopped) return;
    inFlight = true;

    try {
      const report = await deps.dispatch();
      // Silent when there was nothing to do. A line every interval saying
      // "nothing happened" is how a log stops being read.
      if (report.attempted > 0) {
        deps.log(
          `${report.accepted} diterima provider, ${report.retried} akan diulang, ${report.dead} gagal permanen.`,
        );
      }
    } catch (error) {
      if (error instanceof EmailConfigurationError) {
        // This fails identically every tick. Repeating it forever teaches
        // whoever reads the log to ignore it, so say it once and stand down.
        deps.onError("Penjadwal berhenti: pengiriman email belum terkonfigurasi.", error);
        stop();
        return;
      }
      deps.onError("Satu putaran pengiriman gagal; penjadwal tetap berjalan.", error);
    } finally {
      inFlight = false;
    }
  }

  function start(): void {
    if (timer || stopped) return;

    timer = setInterval(() => void tick(), intervalMs);
    // Never hold the process open on this loop's account.
    timer.unref();

    // One prompt pass, so a message queued just before startup does not wait a
    // full interval. Deliberately not awaited by `register`, which has to
    // return before the server accepts requests.
    const first = setTimeout(() => void tick(), 1_000);
    first.unref();
  }

  return { start, stop, tick };
}

/** Guards against a second start; `register` is once per instance, HMR is not. */
let started = false;

export function startOutboxSchedulerFromEnv(): void {
  if (started) return;
  started = true;

  let seconds: number | undefined;
  try {
    seconds = resolvePollSeconds(
      process.env.OUTBOX_POLL_SECONDS,
      process.env.NODE_ENV === "production",
    );
  } catch (error) {
    // A misconfigured interval must not stop the server from starting; the
    // dispatcher is still reachable by hand and by the button.
    console.error("[outbox-scheduler]", error);
    return;
  }

  if (seconds === undefined) return;

  createOutboxScheduler(seconds * 1000, {
    dispatch: () => dispatchDueEmails(),
    log: (message) => console.log(`[outbox-scheduler] ${message}`),
    onError: (message, error) => console.error(`[outbox-scheduler] ${message}`, error),
  }).start();

  console.log(`[outbox-scheduler] aktif, memeriksa antrean tiap ${seconds} detik.`);
}
