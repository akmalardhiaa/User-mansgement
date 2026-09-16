import { describe, expect, it } from "vitest";

import {
  LifecycleTransitionError,
  TERMINAL_STATUSES,
  assertTransition,
  canTransition,
  isActive,
  isAwaitingDecision,
  isTerminal,
  stageAwaiting,
  statusAfterApproval,
  statusAfterDecision,
} from "./stateMachine";
import { LIFECYCLE_STATUSES, type LifecycleStatus } from "./types";

describe("the happy path", () => {
  it("walks submit → manager → ciso → approved → queued → executing → completed", () => {
    const path: LifecycleStatus[] = [
      "DRAFT",
      "PENDING_MANAGER",
      "PENDING_CISO",
      "APPROVED",
      "QUEUED",
      "EXECUTING",
      "COMPLETED",
    ];

    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });
});

describe("transitions that must never exist", () => {
  // The whole point of the two approvals: nothing reaches execution without
  // passing through both of them.
  it.each([
    ["DRAFT", "APPROVED"],
    ["DRAFT", "QUEUED"],
    ["DRAFT", "COMPLETED"],
    ["PENDING_MANAGER", "APPROVED"],
    ["PENDING_MANAGER", "QUEUED"],
    ["PENDING_MANAGER", "COMPLETED"],
    ["PENDING_CISO", "COMPLETED"],
    ["PENDING_CISO", "EXECUTING"],
    ["APPROVED", "COMPLETED"],
  ] as const)("refuses %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(LifecycleTransitionError);
  });

  it("refuses to revive a request once it is cancelled or rejected", () => {
    for (const from of ["REJECTED", "CANCELLED", "EXPIRED", "COMPLETED"] as const) {
      for (const to of LIFECYCLE_STATUSES) {
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });

  it("refuses to cancel a request a worker is already executing", () => {
    // Stopping a change that is already being made in the directory is an
    // operations problem, not a state transition.
    expect(canTransition("EXECUTING", "CANCELLED")).toBe(false);
  });

  it("refuses to revise a request once it has been approved", () => {
    // Past the second approval there is an authorised change waiting to run.
    // Editing it then would execute text nobody approved.
    expect(canTransition("APPROVED", "DRAFT")).toBe(false);
    expect(canTransition("QUEUED", "DRAFT")).toBe(false);
  });

  it("only allows a retry from FAILED, and only back into the queue", () => {
    expect(canTransition("FAILED", "QUEUED")).toBe(true);
    expect(canTransition("FAILED", "EXECUTING")).toBe(false);
    expect(canTransition("FAILED", "COMPLETED")).toBe(false);
  });
});

describe("terminal statuses", () => {
  it("have no way out", () => {
    for (const status of TERMINAL_STATUSES) {
      expect(isTerminal(status)).toBe(true);
      expect(isActive(status)).toBe(false);
      const reachable = LIFECYCLE_STATUSES.filter((to) => canTransition(status, to));
      expect(reachable).toEqual([]);
    }
  });

  it("are exactly the statuses that release the employee for a new request", () => {
    const holding = LIFECYCLE_STATUSES.filter(isActive);
    expect(holding).not.toContain("COMPLETED");
    expect(holding).toContain("PENDING_MANAGER");
    expect(holding).toContain("FAILED");
  });
});

describe("revision", () => {
  it("sends a request still out for approval back to draft", () => {
    expect(canTransition("PENDING_MANAGER", "DRAFT")).toBe(true);
    expect(canTransition("PENDING_CISO", "DRAFT")).toBe(true);
  });
});

describe("decisions", () => {
  it("advances an approval to the next stage", () => {
    expect(statusAfterDecision("PENDING_MANAGER", "APPROVED")).toBe("PENDING_CISO");
    expect(statusAfterDecision("PENDING_CISO", "APPROVED")).toBe("APPROVED");
  });

  it("ends the request on any rejection, at either stage", () => {
    expect(statusAfterDecision("PENDING_MANAGER", "REJECTED")).toBe("REJECTED");
    expect(statusAfterDecision("PENDING_CISO", "REJECTED")).toBe("REJECTED");
  });

  it("refuses a decision on a request that is not waiting for one", () => {
    expect(() => statusAfterDecision("APPROVED", "APPROVED")).toThrow();
    expect(() => statusAfterDecision("DRAFT", "APPROVED")).toThrow();
  });

  it("names the stage a pending request is waiting on", () => {
    expect(stageAwaiting("PENDING_MANAGER")).toBe("MANAGER");
    expect(stageAwaiting("PENDING_CISO")).toBe("CISO");
    expect(stageAwaiting("APPROVED")).toBeUndefined();
    expect(isAwaitingDecision("APPROVED")).toBe(false);
  });
});

describe("what happens after the second approval", () => {
  const now = new Date("2026-09-16T10:00:00.000Z");

  it("queues immediately when no effective date was given", () => {
    expect(statusAfterApproval(undefined, now)).toBe("QUEUED");
  });

  it("parks a request whose effective date has not arrived", () => {
    expect(statusAfterApproval("2026-09-20T00:00:00.000Z", now)).toBe("SCHEDULED");
  });

  it("queues a request whose effective date has already passed rather than stranding it", () => {
    expect(statusAfterApproval("2026-09-01T00:00:00.000Z", now)).toBe("QUEUED");
  });
});
