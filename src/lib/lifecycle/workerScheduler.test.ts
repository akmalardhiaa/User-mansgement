import { describe, expect, it } from "vitest";

import type { RunReport } from "./worker";
import { kickWorker, resolveWorkerPollSeconds } from "./workerScheduler";

const REPORT: RunReport = { ran: 1, completed: 1, failed: 0, reclaimed: 0, outcomes: [] };

describe("how often the worker sweeps", () => {
  it("every 30 seconds outside production, off in production unless configured", () => {
    expect(resolveWorkerPollSeconds(undefined, false)).toBe(30);
    expect(resolveWorkerPollSeconds(undefined, true)).toBeUndefined();
    expect(resolveWorkerPollSeconds("60", true)).toBe(60);
  });

  it("can be switched off, and refuses nonsense", () => {
    expect(resolveWorkerPollSeconds("0", false)).toBeUndefined();
    expect(resolveWorkerPollSeconds("off", false)).toBeUndefined();
    expect(() => resolveWorkerPollSeconds("2", false)).toThrow(/minimal/);
    expect(() => resolveWorkerPollSeconds("setengah menit", false)).toThrow(/bilangan bulat/);
  });
});

describe("kicking the worker", () => {
  it("shares a run already in progress instead of starting a second", async () => {
    let started = 0;
    let finish: (report: RunReport) => void = () => undefined;
    const run = () => {
      started += 1;
      return new Promise<RunReport>((resolve) => {
        finish = resolve;
      });
    };

    const first = kickWorker(run);
    const second = kickWorker(run);
    finish(REPORT);

    expect(await first).toBe(REPORT);
    expect(await second).toBe(REPORT);
    expect(started).toBe(1);
  });

  it("starts a fresh run once the previous one has finished", async () => {
    let started = 0;
    const run = async () => {
      started += 1;
      return REPORT;
    };

    await kickWorker(run);
    await kickWorker(run);
    expect(started).toBe(2);
  });
});
