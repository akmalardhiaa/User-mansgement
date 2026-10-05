import { AdConfigurationError } from "@/lib/ad";
import { processShared } from "@/lib/db/processShared";

import {
  describeDirectorySync,
  syncEmployeesFromDirectory,
  type DirectorySyncReport,
} from "./directorySync";

/**
 * When the portal reads its employees from Active Directory.
 *
 * Five seconds after start, then every AD_SYNC_MINUTES (15 by default), in the
 * same process as the worker - and so, like the worker, on one instance only.
 * Only with AD_DRIVER=ldap: without a directory there is nothing to read.
 *
 * The last result is kept where the status page can read it. Kept in process
 * memory, not in the store: it describes this process's view of the
 * directory, and a restart runs a fresh sync within seconds anyway.
 */

export interface DirectorySyncStatus {
  /** Off, because AD_DRIVER is not ldap or AD_SYNC_MINUTES switched it off. */
  enabled: boolean;
  minutes?: number;
  lastReport?: DirectorySyncReport;
  lastError?: { at: string; message: string };
}

interface State extends DirectorySyncStatus {
  running?: Promise<DirectorySyncReport>;
}

// Shared across module copies: the scheduler runs from instrumentation.ts and
// the status page reads from a route. See lib/db/processShared.ts.
const state = processShared<State>("directory-sync", () => ({ enabled: false }));

export function directorySyncStatus(): DirectorySyncStatus {
  const { enabled, minutes, lastReport, lastError } = state;
  return { enabled, minutes, lastReport, lastError };
}

/** Minutes between syncs. Unset is 15; "0" or "off" switches it off. */
export function resolveDirectorySyncMinutes(raw: string | undefined): number | undefined {
  const value = raw?.trim().toLowerCase();
  if (!value) return 15;
  if (value === "0" || value === "off") return undefined;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 1) {
    throw new Error(`AD_SYNC_MINUTES="${raw}" harus bilangan bulat menit, minimal 1 (atau 0/off untuk mematikan).`);
  }
  return minutes;
}

/** One sync at a time: a second call while one runs shares its result. */
export function runDirectorySync(
  run: () => Promise<DirectorySyncReport> = () => syncEmployeesFromDirectory(),
): Promise<DirectorySyncReport> {
  if (state.running) return state.running;
  const current = run()
    .then((report) => {
      state.lastReport = report;
      state.lastError = undefined;
      return report;
    })
    .catch((error: unknown) => {
      state.lastError = {
        at: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
      };
      throw error;
    })
    .finally(() => {
      state.running = undefined;
    });
  state.running = current;
  return current;
}

let started = false;

export function startDirectorySyncFromEnv(): void {
  if (started) return;
  started = true;

  if (process.env.AD_DRIVER?.trim().toLowerCase() !== "ldap") return;

  let minutes: number | undefined;
  try {
    minutes = resolveDirectorySyncMinutes(process.env.AD_SYNC_MINUTES);
  } catch (error) {
    console.warn(`[ad-sync] ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (minutes === undefined) return;
  state.enabled = true;
  state.minutes = minutes;

  let first = true;
  const tick = async () => {
    try {
      const report = await runDirectorySync();
      if (first || report.created + report.updated + report.linked > 0) {
        console.log(`[ad-sync] ${report.read} akun dibaca dari AD: ${describeDirectorySync(report)}.`);
      }
      first = false;
    } catch (error) {
      if (error instanceof AdConfigurationError) {
        // The same calm line the worker uses: an expected state, not a crash.
        console.warn(
          `[ad-sync] Sinkronisasi karyawan menunggu: Active Directory belum dikonfigurasi. Portal tetap berjalan. (${error.message})`,
        );
        clearInterval(timer);
        return;
      }
      // A domain controller that did not answer this once is retried at the
      // next interval; nothing in the portal was changed by the failed read.
      console.warn(
        `[ad-sync] Sinkronisasi gagal, dicoba lagi ${minutes} menit lagi: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  const timer = setInterval(() => void tick(), minutes * 60_000);
  timer.unref();
  setTimeout(() => void tick(), 5_000).unref();

  console.log(`[ad-sync] aktif, menyinkronkan karyawan dari AD tiap ${minutes} menit.`);
}
