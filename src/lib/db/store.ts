import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { getDataFilePath } from "@/lib/config/storage";
import type { ApprovalTokenRecord } from "@/lib/lifecycle/approvalToken";
import type { ExecutionJob } from "@/lib/lifecycle/executionTypes";
import type { EmailDelivery, OutboxEvent } from "@/lib/lifecycle/outboxTypes";
import type { AuditEvent, LifecycleRequest } from "@/lib/lifecycle/types";
import type { Employee, AccessRequest, ActivityEntry } from "@/lib/types";

import { seedEmployees } from "./seed";

export interface StoreShape {
  employees: Employee[];
  /**
   * The old Jira-era access requests. Read-only legacy: nothing writes here any
   * more, and the flow that once advanced them no longer exists in the code.
   * They are kept until the archival step rather than deleted silently, because
   * they are the only record that those requests were ever raised.
   */
  requests: AccessRequest[];
  /** Newest first. See ActivityEntry for why this exists alongside events. */
  activity: ActivityEntry[];
  /** The lifecycle requests — the model everything new is written against. */
  lifecycleRequests: LifecycleRequest[];
  /**
   * Attempts to make approved changes real, with their per-step checkpoints.
   * Kept apart from the requests: a request is decided once, while execution
   * may be attempted several times and has to remember how far it got.
   */
  executionJobs: ExecutionJob[];
  /**
   * Emails owed, committed alongside the state change that owes them. A crash
   * between deciding and sending costs a delay, not a lost approval.
   */
  outboxEvents: OutboxEvent[];
  /**
   * What the provider said, per attempt. Kept apart from the event so a message
   * that took four tries still shows all four.
   */
  emailDeliveries: EmailDelivery[];
  /**
   * Hashes of the links in approval emails. The raw token is never here — it
   * lives only in the sealed outbox payload, until the message is sent.
   */
  approvalTokens: ApprovalTokenRecord[];
  /**
   * When the legacy workflow was archived, if it has been. Its only job is to
   * make the migration idempotent: running it twice must not re-reconcile
   * accounts an operator has since corrected by hand.
   */
  legacyArchivedAt?: string;
  /**
   * Append-only evidence, oldest first. Deliberately separate from `activity`,
   * which is a capped recent-changes feed: a log that trims itself is fine for
   * a dashboard and useless as an audit trail.
   */
  auditEvents: AuditEvent[];
}

/**
 * A deliberately small JSON-file persistence layer.
 *
 * Everything above this module talks to `repository.ts`, so swapping this for
 * a real database later means rewriting one file rather than the whole app.
 */

function emptyStore(): StoreShape {
  return {
    employees: seedEmployees(),
    requests: [],
    activity: [],
    lifecycleRequests: [],
    executionJobs: [],
    outboxEvents: [],
    emailDeliveries: [],
    approvalTokens: [],
    auditEvents: [],
  };
}

function resolvePath(): string {
  const configured = getDataFilePath();
  // The location is deliberately runtime-configurable via HC_DATA_FILE, so
  // Turbopack cannot statically scope it. Opt out of dependency tracing rather
  // than let it pull the entire project into the server bundle.
  return path.isAbsolute(configured)
    ? configured
    : path.join(/* turbopackIgnore: true */ process.cwd(), configured);
}

async function load(): Promise<StoreShape> {
  const file = resolvePath();
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    return {
      employees: parsed.employees ?? [],
      requests: parsed.requests ?? [],
      // Defaulted rather than required, so a store written before the log
      // existed loads instead of throwing. The same applies to the two
      // lifecycle collections: an existing store predates both.
      activity: parsed.activity ?? [],
      lifecycleRequests: parsed.lifecycleRequests ?? [],
      executionJobs: parsed.executionJobs ?? [],
      outboxEvents: parsed.outboxEvents ?? [],
      emailDeliveries: parsed.emailDeliveries ?? [],
      approvalTokens: parsed.approvalTokens ?? [],
      auditEvents: parsed.auditEvents ?? [],
      legacyArchivedAt: parsed.legacyArchivedAt,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const seeded = emptyStore();
      await persist(seeded);
      return seeded;
    }
    throw error;
  }
}

async function persist(store: StoreShape): Promise<void> {
  const file = resolvePath();
  await mkdir(path.dirname(file), { recursive: true });
  // Write-then-rename so a crash mid-write can never leave a truncated file.
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}

/**
 * Serialises every store access. Node is single-threaded but `await` points
 * interleave, so two concurrent webhook deliveries could otherwise read the
 * same snapshot and clobber each other's write.
 */
let queue: Promise<unknown> = Promise.resolve();

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** Read-only snapshot of the store. */
export function readStore(): Promise<StoreShape> {
  return withLock(load);
}

/**
 * Read-modify-write under the lock. `mutator` receives a live draft; whatever
 * it returns is handed back to the caller once the draft has been persisted.
 */
export function mutateStore<T>(mutator: (draft: StoreShape) => T | Promise<T>): Promise<T> {
  return withLock(async () => {
    const draft = await load();
    const result = await mutator(draft);
    await persist(draft);
    return result;
  });
}
