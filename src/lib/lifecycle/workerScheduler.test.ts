import { afterEach, describe, expect, it, vi } from "vitest";

import { AdConfigurationError } from "@/lib/ad";

import type { RunReport } from "./worker";
import { kickWorker, kickWorkerAfterApproval, resolveWorkerPollSeconds } from "./workerScheduler";

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

describe("a worker with no directory to act on yet", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("says so on one calm line, not as an error, so the portal does not look dead", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await kickWorkerAfterApproval(() => Promise.reject(new AdConfigurationError("AD_DRIVER belum diset.")));

    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/Worker menunggu.*Portal tetap berjalan/);
  });

  it("still reports any other failure as an error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await kickWorkerAfterApproval(() => Promise.reject(new Error("disk penuh")));

    expect(error).toHaveBeenCalledTimes(1);
  });
});
