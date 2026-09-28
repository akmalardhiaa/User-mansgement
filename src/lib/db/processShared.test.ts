import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { processLock, processShared } from "./processShared";

/**
 * The approval that was lost on 22 September 2026.
 *
 * Next gives the route handlers, the pages and instrumentation.ts separate
 * copies of every server module. `vi.resetModules()` followed by a fresh import
 * reproduces that exactly: two copies of store.ts, each with its own
 * module-level variables, in one process.
 */

type StoreModule = typeof import("./store");

async function freshCopyOfStore(): Promise<StoreModule> {
  vi.resetModules();
  return import("./store");
}

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "hc-processlock-"));
  vi.stubEnv("HC_DATA_FILE", path.join(workspace, "hc-store.json"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(workspace, { recursive: true, force: true });
});

describe("the store lock across module copies", () => {
  it("does not let one copy's save overwrite another's", async () => {
    const routes = await freshCopyOfStore();
    const schedulers = await freshCopyOfStore();
    expect(routes).not.toBe(schedulers);

    // Create the store once, so both copies read the same file from here on.
    await routes.mutateStore((draft) => {
      draft.activity = [];
    });

    // The dispatcher reads the store, then pauses mid-transaction...
    let resume!: () => void;
    const paused = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const dispatcher = schedulers.mutateStore(async (draft) => {
      await paused;
      draft.legacyArchivedAt = "dispatcher-was-here";
    });

    // ...while the approval route saves a decision.
    const approval = routes.mutateStore((draft) => {
      draft.activity.push({ id: "approval" } as never);
    });

    resume();
    await Promise.all([dispatcher, approval]);

    const after = await routes.readStore();
    expect(after.legacyArchivedAt).toBe("dispatcher-was-here");
    // With a lock per copy, the dispatcher's save landed on top of this one.
    expect(after.activity.map((entry) => entry.id)).toEqual(["approval"]);
  });
});

describe("processLock", () => {
  it("runs tasks with the same name one at a time, in arrival order", async () => {
    const lockA = processLock("test-order");
    const lockB = processLock("test-order");
    const order: string[] = [];

    await Promise.all([
      lockA(async () => {
        order.push("first:start");
        await new Promise((resolve) => setTimeout(resolve, 20));
        order.push("first:end");
      }),
      lockB(async () => {
        order.push("second");
      }),
    ]);

    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  it("keeps going after a task fails", async () => {
    const lock = processLock("test-failure");
    await expect(lock(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(lock(async () => "next")).resolves.toBe("next");
  });
});

describe("processShared", () => {
  it("hands every caller the same value for a name", () => {
    const first = processShared("test-value", () => ({ n: 1 }));
    const second = processShared("test-value", () => ({ n: 2 }));
    expect(second).toBe(first);
  });
});
