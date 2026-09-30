import { describe, expect, it } from "vitest";

import { parseLifecycleRequestInput } from "./lifecycleRequestInput";

/**
 * The two things the forms stopped doing, checked where they are enforced.
 *
 * Both are server-side rules rather than form behaviour on purpose: the form is
 * one client, and a rule that only the form applies is a rule anybody with a
 * terminal can skip.
 */

const NOW = new Date("2026-09-30T03:00:00.000Z");

const ONBOARDING = {
  type: "ONBOARDING",
  firstName: "Nadia",
  lastName: "Kusuma",
  displayName: "Nadia Kusuma",
  email: "nadiakusuma1@mandirisekuritas.co.id",
  userId: "nadiakusuma1",
  jobTitle: "Backend Engineer",
  department: "IT — Engineering",
  employmentType: "PERMANENT",
  locationType: "PUSAT",
  managerName: "Bagus Nugroho",
  managerEmail: "bagus.nugroho@example.com",
  startDate: "2026-10-15",
};

const TERMINATION = {
  type: "TERMINATION",
  employeeId: "emp-1",
  lastWorkingDate: "2026-10-31",
};

function parse(body: Record<string, unknown>) {
  return parseLifecycleRequestInput(body, NOW);
}

describe("the login name on an onboarding", () => {
  it("is required, because the account is created with it", () => {
    const result = parse({ ...ONBOARDING, userId: "" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.userId).toBeTruthy();
  });

  it("is kept as typed once it is valid", () => {
    const result = parse(ONBOARDING);

    expect(result.ok).toBe(true);
    if (result.ok && result.value.payload.kind === "ONBOARDING") {
      expect(result.value.payload.userId).toBe("nadiakusuma1");
    }
  });

  it("is lower-cased, because the directory compares it that way", () => {
    // "Nadia" and "nadia" are one account. Storing whichever was typed would
    // make two records look different while naming the same thing.
    const result = parse({ ...ONBOARDING, userId: "NadiaKusuma1" });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.payload.kind === "ONBOARDING") {
      expect(result.value.payload.userId).toBe("nadiakusuma1");
    }
  });

  it.each(["nadia kusuma", "nadia@kusuma", "n", "nadia/kusuma", "-nadia"])(
    "refuses %s rather than sending it to a directory",
    (userId) => {
      const result = parse({ ...ONBOARDING, userId });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.userId).toBeTruthy();
    },
  );
});

describe("when a termination takes effect", () => {
  it("is the day AFTER the last working day, derived rather than asked for", () => {
    // Disabling at the start of the last working day would take the account
    // away on the morning of the day they were told they still had.
    const result = parse(TERMINATION);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.effectiveAt).toBe("2026-11-01T00:00:00+07:00");
  });

  it("rolls over a year end", () => {
    const result = parse({ ...TERMINATION, lastWorkingDate: "2026-12-31" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.effectiveAt).toBe("2027-01-01T00:00:00+07:00");
  });

  it("still honours an explicit date, for a request raised before this", () => {
    const result = parse({ ...TERMINATION, effectiveAt: "2026-11-15" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.effectiveAt).toBe("2026-11-15T00:00:00+07:00");
  });

  it("leaves an onboarding with no effective date at all", () => {
    // Its account is made as soon as both approvals are in, whatever the start
    // date says — two date fields are how a start-today hire never appeared.
    const result = parse(ONBOARDING);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.effectiveAt).toBeUndefined();
  });
});
