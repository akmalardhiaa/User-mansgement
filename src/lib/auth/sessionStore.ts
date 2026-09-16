import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

import type { PortalRole } from "./roles";

/**
 * Persistence for server-side sessions.
 *
 * Deliberately its own file rather than a collection inside the employee store:
 * sessions are touched on a different rhythm to the directory, and the store is
 * rewritten whole on every write. Sharing one file would mean re-serialising
 * the entire roster every time somebody loads a page.
 *
 * Single host, single process, one JSON file — which is exactly the demo
 * topology the plan calls for. It is not a shared session store for a
 * multi-instance deployment; moving to PostgreSQL means reimplementing this
 * module and nothing above it.
 */

export interface SessionRecord {
  /**
   * SHA-256 of the session id. The id itself is only ever in the cookie: a
   * leaked copy of this file must not be usable to impersonate anyone.
   */
  idHash: string;
  userId: string;
  username: string;
  email: string;
  fullName: string;
  roles: PortalRole[];
  department?: string;
  createdAt: string;
  /** Hard ceiling. Reached, the session dies whatever the person is doing. */
  absoluteExpiresAt: string;
  /** Moves forward as the person keeps working, never past the absolute one. */
  idleExpiresAt: string;
  lastSeenAt: string;
  /** Set when revoked — by logout, by a role change, by an operator. */
  revokedAt?: string;
  revokedReason?: string;
}

interface SessionFile {
  sessions: SessionRecord[];
}

function resolvePath(): string {
  const configured = process.env.HC_SESSION_FILE?.trim() || "data/hc-sessions.json";
  return path.isAbsolute(configured)
    ? configured
    : path.join(/* turbopackIgnore: true */ process.cwd(), configured);
}

async function load(): Promise<SessionFile> {
  try {
    const raw = await readFile(resolvePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<SessionFile>;
    return { sessions: parsed.sessions ?? [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { sessions: [] };
    throw error;
  }
}

async function persist(file: SessionFile): Promise<void> {
  const target = resolvePath();
  await mkdir(path.dirname(target), { recursive: true });
  // Write-then-rename: a crash mid-write must not leave a truncated file that
  // would sign everybody out on the next read.
  const tmp = `${target}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  await rename(tmp, target);
}

/** Serialises access, so two concurrent requests cannot clobber each other. */
let queue: Promise<unknown> = Promise.resolve();

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function readSessions(): Promise<SessionRecord[]> {
  return withLock(async () => (await load()).sessions);
}

export function mutateSessions<T>(mutator: (draft: SessionRecord[]) => T): Promise<T> {
  return withLock(async () => {
    const file = await load();
    const result = mutator(file.sessions);
    await persist(file);
    return result;
  });
}
