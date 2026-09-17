import { describe, expect, it, vi } from "vitest";

import { EmailConfigurationError } from "@/lib/email";

import { createOutboxScheduler, resolvePollSeconds, type SchedulerDeps } from "./scheduler";
import type { DispatchReport } from "./dispatcher";

/**
 * When the loop runs, and what it refuses to do.
 *
 * The timer itself is not tested — `tick` is called directly instead, because
 * what matters is the behaviour around a run, not that setInterval works.
 */

function report(overrides: Partial<DispatchReport> = {}): DispatchReport {
  return { attempted: 0, accepted: 0, retried: 0, dead: 0, outcomes: [], ...overrides };
}

function deps(overrides: Partial<SchedulerDeps> = {}): SchedulerDeps {
  return {
    dispatch: async () => report(),
    log: () => {},
    onError: () => {},
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("how often it polls", () => {
  it("runs on its own outside production", () => {
    expect(resolvePollSeconds(undefined, false)).toBe(30);
  });

  it("stays off in production unless asked for", () => {
    // The store's lock is per-process, so this loop is correct for exactly one
    // instance — and a deployment does not know how many it has.
    expect(resolvePollSeconds(undefined, true)).toBeUndefined();
  });

  it("can be switched off explicitly", () => {
    expect(resolvePollSeconds("0", false)).toBeUndefined();
    expect(resolvePollSeconds("off", false)).toBeUndefined();
  });

  it("takes an explicit interval in either environment", () => {
    expect(resolvePollSeconds("60", true)).toBe(60);
  });

  it("refuses a value that is not whole seconds", () => {
    expect(() => resolvePollSeconds("10.5", false)).toThrow(EmailConfigurationError);
    expect(() => resolvePollSeconds("sering", false)).toThrow(EmailConfigurationError);
  });

  it("refuses an interval tight enough to fight the store lock", () => {
    // Refused rather than quietly clamped: running at a rate nobody configured
    // is how somebody debugs the wrong thing for an hour.
    expect(() => resolvePollSeconds("1", false)).toThrow(/minimal/);
  });
});

describe("one pass at a time", () => {
  it("does not start a second run while the first is still going", async () => {
    const gate = deferred<DispatchReport>();
    const dispatch = vi.fn(() => gate.promise);
    const scheduler = createOutboxScheduler(1_000, deps({ dispatch }));

    const first = scheduler.tick();
    await scheduler.tick(); // would overlap; must be refused

    expect(dispatch).toHaveBeenCalledTimes(1);

    gate.resolve(report());
    await first;

    // Free again once the run finished.
    await scheduler.tick();
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("says nothing when there was nothing to send", async () => {
    const log = vi.fn();
    await createOutboxScheduler(1_000, deps({ log })).tick();

    // A line every interval saying "nothing happened" is how a log stops
    // being read.
    expect(log).not.toHaveBeenCalled();
  });

  it("reports a pass that actually sent something", async () => {
    const log = vi.fn();
    const dispatch = async () => report({ attempted: 2, accepted: 2 });
    await createOutboxScheduler(1_000, deps({ dispatch, log })).tick();

    expect(log).toHaveBeenCalledOnce();
  });
});

describe("when a pass fails", () => {
  it("keeps going after a transient failure", async () => {
    const dispatch = vi
      .fn()
      .mockRejectedValueOnce(new Error("provider sedang bermasalah"))
      .mockResolvedValue(report());
    const onError = vi.fn();
    const scheduler = createOutboxScheduler(1_000, deps({ dispatch, onError }));

    await scheduler.tick();
    await scheduler.tick();

    expect(onError).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("stands down when the failure is configuration", async () => {
    // EMAIL_DRIVER unset fails identically every tick. Repeating it forever
    // teaches whoever reads the log to ignore it.
    const dispatch = vi.fn().mockRejectedValue(new EmailConfigurationError("belum diset"));
    const scheduler = createOutboxScheduler(1_000, deps({ dispatch }));

    await scheduler.tick();
    await scheduler.tick();

    expect(dispatch).toHaveBeenCalledOnce();
  });
});
