import { describe, expect, it } from "vitest";

import { MAX_SEND_ATTEMPTS, isExhausted, nextAttemptAfter } from "./outboxTypes";

const FROM = new Date("2026-09-16T10:00:00.000Z");

function minutesLater(iso: string): number {
  return (Date.parse(iso) - FROM.getTime()) / 60_000;
}

describe("the backoff ladder", () => {
  it("climbs 1, 5, 15, 30, 60 minutes", () => {
    const rungs = [1, 2, 3, 4, 5].map((attempt) => Math.floor(minutesLater(nextAttemptAfter(attempt, FROM))));

    expect(rungs).toEqual([1, 5, 15, 30, 60]);
  });

  it("adds jitter, so a recovering provider is not hit by everything at once", () => {
    const delays = new Set(
      Array.from({ length: 20 }, () => nextAttemptAfter(1, FROM)),
    );

    // Not all identical, and never before the rung itself.
    expect(delays.size).toBeGreaterThan(1);
    for (const at of delays) {
      expect(minutesLater(at)).toBeGreaterThanOrEqual(1);
      expect(minutesLater(at)).toBeLessThan(1.6);
    }
  });

  it("obeys a provider that said when to come back", () => {
    // Ignoring Retry-After is how a rate limit becomes a longer rate limit.
    expect(minutesLater(nextAttemptAfter(1, FROM, 600))).toBe(10);
  });

  it("stays on the last rung past the end of the ladder", () => {
    expect(Math.floor(minutesLater(nextAttemptAfter(99, FROM)))).toBe(60);
  });
});

describe("giving up", () => {
  it("dead-letters once the attempts are used up", () => {
    expect(isExhausted(MAX_SEND_ATTEMPTS - 1)).toBe(false);
    // An event retried forever is an event nobody ever looks at.
    expect(isExhausted(MAX_SEND_ATTEMPTS)).toBe(true);
  });
});
