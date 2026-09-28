import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

import { processShared } from "./processShared";

/**
 * Reading a state file without ever mistaking "briefly invisible" for "gone".
 *
 * Every store here used to read a missing file as an empty one — and the main
 * store went further and wrote a freshly seeded store over it. On 22 September
 * 2026 that erased the whole portal: running in Docker with `data/` shared from
 * Windows, the store file was invisible to the container for a moment while
 * another file in the same folder was being replaced, a scheduler read it in
 * that moment, and persisted six seed employees over twenty-eight requests.
 *
 * So a missing file is only believed when this process has never seen it —
 * which is what a first run actually looks like. A file that WAS there and now
 * is not is re-read a few times; if it is still missing, that is an error, and
 * nothing is written. Failing one request is recoverable. Silently replacing
 * the data is not.
 */

// Process-wide: a file the route handlers have seen counts as seen by the
// schedulers' copy of this module too. See processShared.ts.
const seen = processShared("state-files-seen", () => new Set<string>());

/** How long a vanished file is waited for before it is reported, not assumed. */
const RETRY_DELAYS_MS = [50, 150, 400, 1000];

export class StateFileVanishedError extends Error {
  constructor(readonly file: string) {
    super(
      `Berkas data ${file} tiba-tiba tidak terlihat, padahal sebelumnya ada. Tidak ada yang ditulis — ` +
        "periksa apakah berkasnya terhapus atau folder data sedang dipakai program lain, lalu coba lagi.",
    );
    this.name = "StateFileVanishedError";
  }
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

/**
 * The file's content, or `undefined` when it genuinely does not exist yet.
 * Throws StateFileVanishedError when a file this process has seen goes missing.
 */
export async function readStateFile(file: string): Promise<string | undefined> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const raw = await readFile(file, "utf8");
      seen.add(file);
      return raw;
    } catch (error) {
      if (!isMissing(error)) throw error;
      // Never seen by this process: a first run, and believable as such.
      if (!seen.has(file)) return undefined;
      if (attempt >= RETRY_DELAYS_MS.length) throw new StateFileVanishedError(file);
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

/** Records that a file exists, after this process wrote it. */
export function markStateFileSeen(file: string): void {
  seen.add(file);
}

/**
 * Creates a file only when nothing is there. Returns false, writing nothing,
 * if a file exists — including one that reappeared since it was found missing.
 */
export async function createStateFileIfAbsent(file: string, content: string): Promise<boolean> {
  try {
    await writeFile(file, content, { encoding: "utf8", flag: "wx" });
    seen.add(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "EEXIST") return false;
    throw error;
  }
}

/** For tests: forget which files have been seen. */
export function resetSeenStateFiles(): void {
  seen.clear();
}
