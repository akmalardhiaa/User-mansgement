import { appendFile, mkdir, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";

import { processLock } from "@/lib/db/processShared";

/**
 * Who signed in, who failed to, and what ended their sessions.
 *
 * One JSON object per line in data/hc-security-log.jsonl, appended — never a
 * rewrite of the whole file, so a crash loses at most the line being written.
 * When the file passes ROTATE_BYTES it becomes .1 (replacing the previous .1),
 * which keeps months of sign-ins for an HC team without growing forever.
 *
 * Never a password and never a 2FA code: only what happened, to which account
 * name, from which address. Each line also goes to the console, so it reaches
 * the container log where IT may already be collecting logs.
 *
 * A failure to write here never fails the sign-in it describes. Logging that
 * can lock everybody out of the portal is worse than a gap in the log.
 */

export const SECURITY_EVENT_TYPES = [
  "login.success",
  "login.failed",
  "login.locked",
  "login.denied",
  "login.unavailable",
  "mfa.enrolled",
  "mfa.failed",
  "mfa.reset",
  "logout",
  "session.revoked",
] as const;

export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

export interface SecurityEvent {
  at: string;
  type: SecurityEventType;
  /** The account name as typed, or as AD knows it once signed in. */
  username?: string;
  ip?: string;
  detail?: string;
}

const ROTATE_BYTES = 5 * 1024 * 1024;

function resolvePath(): string {
  const configured = process.env.HC_SECURITY_LOG_FILE?.trim() || "data/hc-security-log.jsonl";
  return path.isAbsolute(configured)
    ? configured
    : path.join(/* turbopackIgnore: true */ process.cwd(), configured);
}

const withLock = processLock("hc-security-log");

export async function recordSecurityEvent(
  event: Omit<SecurityEvent, "at">,
  now: Date = new Date(),
): Promise<void> {
  const entry: SecurityEvent = { at: now.toISOString(), ...event };
  console.log(
    `[security] ${entry.type}${entry.username ? ` ${entry.username}` : ""}${entry.ip ? ` dari ${entry.ip}` : ""}${
      entry.detail ? ` — ${entry.detail}` : ""
    }`,
  );
  try {
    await withLock(async () => {
      const file = resolvePath();
      await mkdir(path.dirname(file), { recursive: true });
      const size = await stat(file).then((info) => info.size).catch(() => 0);
      if (size > ROTATE_BYTES) await rename(file, `${file}.1`);
      await appendFile(file, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
    });
  } catch (error) {
    console.error("[security] catatan keamanan tidak bisa ditulis:", error);
  }
}

/** The newest events first, from the current file. */
export async function recentSecurityEvents(limit = 50): Promise<SecurityEvent[]> {
  return withLock(async () => {
    const raw = await readFile(resolvePath(), "utf8").catch(() => "");
    const events: SecurityEvent[] = [];
    for (const line of raw.split("\n").reverse()) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line) as SecurityEvent);
      } catch {
        // A line cut short by a crash; the rest of the log is still worth reading.
      }
      if (events.length >= limit) break;
    }
    return events;
  });
}
