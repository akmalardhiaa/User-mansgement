import { clearInterval, setInterval, setTimeout } from "node:timers";

import { AdConfigurationError } from "@/lib/ad";
import { processShared } from "@/lib/db/processShared";

import { runDueJobs, type RunReport } from "./worker";

/**
 * Running the execution worker without anybody pressing a button.
 *
 * HC's expectation is simple: once both approvals are in, the account exists.
 * Before this the worker only ran from "Jalankan worker", so an approved new
 * hire sat in the queue until someone remembered to click — and looked, to
 * everyone watching the dashboard, exactly like a request that had not worked.
 *
 * Two triggers, one worker:
 *
 *   - `kickWorker()` right after the approval that queues a request, so the
 *     account is made seconds after the CISO answers.
 *   - A sweep every `WORKER_POLL_SECONDS` (default 30 outside production), for
 *     anything the kick missed — a restart in between, a transient directory
 *     failure the next attempt clears.
 *
 * They never run over each other: a kick while a run is in progress shares
 * that run instead of starting a second. Every step of the worker is already
 * safe to repeat, but two overlapping runs would still double the directory
 * traffic for nothing.
 *
 * Off in production unless configured, for the same reason as the outbox
 * scheduler: the store lock is per process, so an in-process loop is correct
 * for exactly one instance. A deployment with more needs one external trigger
 * calling POST /api/worker/run instead.
 */

const DEFAULT_DEV_SECONDS = 30;
const MINIMUM_SECONDS = 5;

export class WorkerSchedulerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerSchedulerConfigError";
  }
}

export function resolveWorkerPollSeconds(
  raw: string | undefined,
  production: boolean,
): number | undefined {
  const value = raw?.trim();
  if (!value) return production ? undefined : DEFAULT_DEV_SECONDS;
  if (value === "0" || value.toLowerCase() === "off") return undefined;

  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds < 0) {
    throw new WorkerSchedulerConfigError(
      `WORKER_POLL_SECONDS="${value}" bukan bilangan bulat detik. Isi 0 untuk mematikan.`,
    );
  }
  if (seconds < MINIMUM_SECONDS) {
    throw new WorkerSchedulerConfigError(
      `WORKER_POLL_SECONDS=${seconds} terlalu rapat; minimal ${MINIMUM_SECONDS} detik.`,
    );
  }
  return seconds;
}

/*
 * Process-wide rather than per module: the kick after an approval runs in the
 * route handler's copy of this file and the sweep in instrumentation's copy,
 * and they should wait on one run, not start two. See db/processShared.ts.
 */
const running = processShared<{ current?: Promise<RunReport> }>("worker-run", () => ({}));

/** Runs the worker now — or, if a run is already going, waits on that one. */
export function kickWorker(run: () => Promise<RunReport> = () => runDueJobs()): Promise<RunReport> {
  if (running.current) return running.current;
  const current = run().finally(() => {
    running.current = undefined;
  });
  running.current = current;
  return current;
}

function describe(report: RunReport): string {
  return `${report.completed} selesai, ${report.failed} gagal${
    report.reclaimed ? `, ${report.reclaimed} lease kedaluwarsa` : ""
  }.`;
}

/** The kick after an approval: logged, never thrown at the approver. */
export async function kickWorkerAfterApproval(): Promise<void> {
  try {
    const report = await kickWorker();
    if (report.ran > 0) console.log(`[worker] dijalankan setelah persetujuan: ${describe(report)}`);
  } catch (error) {
    // The approval is already recorded. A worker that cannot run now is picked
    // up by the sweep, or by an operator pressing the button.
    console.error("[worker] gagal dijalankan setelah persetujuan", error);
  }
}

let started = false;

export function startWorkerSchedulerFromEnv(): void {
  if (started) return;
  started = true;

  let seconds: number | undefined;
  try {
    seconds = resolveWorkerPollSeconds(
      process.env.WORKER_POLL_SECONDS,
      process.env.NODE_ENV === "production",
    );
  } catch (error) {
    console.error("[worker-scheduler]", error);
    return;
  }
  if (seconds === undefined) return;

  const tick = async () => {
    try {
      const report = await kickWorker();
      if (report.ran > 0 || report.reclaimed > 0) {
        console.log(`[worker-scheduler] ${describe(report)}`);
      }
    } catch (error) {
      if (error instanceof AdConfigurationError) {
        // Misconfiguration does not fix itself; retrying it every half minute
        // only buries the one line that says what is wrong.
        console.error("[worker-scheduler] Berhenti: direktori belum terkonfigurasi.", error);
        clearInterval(timer);
        return;
      }
      console.error("[worker-scheduler] Satu putaran gagal; penjadwal tetap berjalan.", error);
    }
  };

  // Declared after `tick`, which only reads it once it has run — by then this
  // line has too.
  const timer = setInterval(() => void tick(), seconds * 1000);
  timer.unref();
  setTimeout(() => void tick(), 2_000).unref();

  console.log(`[worker-scheduler] aktif, menjalankan pengajuan yang disetujui tiap ${seconds} detik.`);
}
