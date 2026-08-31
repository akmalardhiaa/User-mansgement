import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { getDataFilePath } from "@/lib/config/env";
import type { Employee, OnboardingRequest } from "@/lib/types";

import { seedEmployees } from "./seed";

export interface StoreShape {
  employees: Employee[];
  requests: OnboardingRequest[];
}

/**
 * A deliberately small JSON-file persistence layer.
 *
 * Everything above this module talks to `repository.ts`, so swapping this for
 * Postgres/Prisma later means rewriting one file rather than the whole app.
 */

function emptyStore(): StoreShape {
  return { employees: seedEmployees(), requests: [] };
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
