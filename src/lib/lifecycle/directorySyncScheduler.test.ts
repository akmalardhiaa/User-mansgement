import { describe, expect, it } from "vitest";

import type { DirectorySyncReport } from "./directorySync";
import {
  directorySyncStatus,
  resolveDirectorySyncMinutes,
  runDirectorySync,
} from "./directorySyncScheduler";

const REPORT: DirectorySyncReport = {
  at: "2026-10-05T03:00:00.000Z",
  sources: ["DC=corp,DC=example,DC=com"],
  read: 3,
  created: 1,
  updated: 0,
  linked: 0,
  skipped: 1,
  ignoredDisabled: 1,
  conflicts: 0,
  notFound: 0,
};

describe("how often the directory is read", () => {
  it("every 15 minutes unless configured, and can be switched off", () => {
    expect(resolveDirectorySyncMinutes(undefined)).toBe(15);
    expect(resolveDirectorySyncMinutes("60")).toBe(60);
    expect(resolveDirectorySyncMinutes("0")).toBeUndefined();
    expect(resolveDirectorySyncMinutes("off")).toBeUndefined();
  });

  it("refuses nonsense", () => {
    expect(() => resolveDirectorySyncMinutes("setengah jam")).toThrow(/bilangan bulat/);
    expect(() => resolveDirectorySyncMinutes("-5")).toThrow(/minimal 1/);
  });
});

describe("running a sync", () => {
  it("shares a sync already in progress instead of starting a second", async () => {
    let started = 0;
    let finish: (report: DirectorySyncReport) => void = () => undefined;
    const run = () => {
      started += 1;
      return new Promise<DirectorySyncReport>((resolve) => {
        finish = resolve;
      });
    };

    const first = runDirectorySync(run);
    const second = runDirectorySync(run);
    finish(REPORT);

    expect(await first).toBe(await second);
    expect(started).toBe(1);
  });

  it("keeps the last result for the status page, and the last failure", async () => {
    await runDirectorySync(() => Promise.resolve(REPORT));
    expect(directorySyncStatus().lastReport).toEqual(REPORT);
    expect(directorySyncStatus().lastError).toBeUndefined();

    await expect(runDirectorySync(() => Promise.reject(new Error("DC tidak menjawab")))).rejects.toThrow();
    expect(directorySyncStatus().lastError?.message).toBe("DC tidak menjawab");
    // The last good read is still known after a failed one.
    expect(directorySyncStatus().lastReport).toEqual(REPORT);
  });
});
