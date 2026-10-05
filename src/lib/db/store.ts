import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { getDataFilePath } from "@/lib/config/storage";
import { processLock } from "@/lib/db/processShared";
import { createStateFileIfAbsent, markStateFileSeen, readStateFile } from "@/lib/db/stateFile";
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

/**
 * Whether this portal is acting on a real directory.
 *
 * The same test accessProfiles.ts applies before it lets a placeholder DN
 * through, for the same reason: once a domain controller is on the other end,
 * example data stops being harmless. Here the example data is the seed
 * employees — fictitious people who would sit in the directory table beside
 * real ones, and whom a movement or termination could be raised against.
 */
function actsOnRealDirectory(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.AD_DRIVER?.trim().toLowerCase() === "ldap"
  );
}

function emptyStore(): StoreShape {
  return {
    employees: actsOnRealDirectory() ? [] : seedEmployees(),
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

function parse(raw: string): StoreShape {
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
}

function serialise(store: StoreShape): string {
  return `${JSON.stringify(store, null, 2)}\n`;
}

async function load(): Promise<StoreShape> {
  const file = resolvePath();

  // Throws rather than returning nothing if a store this process has read
  // before goes missing — see stateFile.ts for the day that mattered.
  const raw = await readStateFile(file);
  if (raw !== undefined) return parse(raw);

  /*
   * A genuine first run: seed it — with demo employees only when no real
   * directory is configured. Written with "create only if absent", never
   * write-then-rename, so a store that reappears between being found missing
   * and this line is read, not overwritten.
   */
  const seeded = emptyStore();
  await mkdir(path.dirname(file), { recursive: true });
  if (await createStateFileIfAbsent(file, serialise(seeded))) return seeded;
  return parse(await readFile(file, "utf8"));
}

async function persist(store: StoreShape): Promise<void> {
  const file = resolvePath();
  await mkdir(path.dirname(file), { recursive: true });
  // Write-then-rename so a crash mid-write can never leave a truncated file.
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, serialise(store), "utf8");
  await rename(tmp, file);
  markStateFileSeen(file);
}

/**
 * Serialises every store access: the API routes, the pages and the schedulers
 * in instrumentation.ts all queue on the same lock. See processShared.ts for
 * why that lock can't be a module-level variable.
 */
const withLock = processLock("hc-store");

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
