import { describe, expect, it } from "vitest";

import { parseEmployeeProfileInput } from "./employeeProfileInput";
import { DATE_BOUNDS, checkDate, dateInputBounds } from "./dates";
import { statusAfterApproval } from "@/lib/lifecycle/stateMachine";

import { parseLifecycleRequestInput } from "./lifecycleRequestInput";

/**
 * Dates that parse but mean nothing.
 *
 * Every year below was really submitted from the onboarding form and accepted:
 * the date input lets a year run to six digits. The one with an effective date
 * in 132144 was approved twice and then waited, SCHEDULED, for a day that will
 * not come — the employee simply never appeared.
 */

const NOW = new Date("2026-09-22T03:00:00.000Z");

const ONBOARDING = {
  type: "ONBOARDING",
  firstName: "Aad",
  lastName: "Afaafw",
  displayName: "Aad Afaafw",
  email: "aad.afaafw@example.com",
  userId: "aad.afaafw",
  jobTitle: "Backend",
  department: "IT — Security",
  employmentType: "PERMANENT",
  locationType: "PUSAT",
  managerName: "Sarah Wijaya",
  managerEmail: "sarah.wijaya@example.com",
  startDate: "2026-10-01",
  accessProfileId: "standard",
};

const TERMINATION = {
  type: "TERMINATION",
  employeeId: "emp_1",
  reasonCategory: "RESIGN",
  lastWorkingDate: "2026-10-31",
};

function errorsFor(overrides: Record<string, unknown>, base: Record<string, unknown> = ONBOARDING) {
  const parsed = parseLifecycleRequestInput({ ...base, ...overrides }, NOW);
  return parsed.ok ? {} : parsed.errors;
}

describe("dates the onboarding form really accepted", () => {
  it.each(["132144-12-13", "49000-01-01", "110299-02-02", "129219-09-12"])(
    "refuses an effective date of %s",
    (effectiveAt) => {
      // An onboarding has no effective date of its own any more, so these are
      // checked where the field still exists.
      expect(errorsFor({ effectiveAt }, TERMINATION).effectiveAt).toBeTruthy();
    },
  );

  it.each(["2313-12-12", "2993-09-19", "92929-02-19", "32331-09-12"])(
    "refuses a start date of %s",
    (startDate) => {
      expect(errorsFor({ startDate }).startDate).toBeTruthy();
    },
  );

  it("refuses 9222 and 2113 too: four digits, but centuries away", () => {
    expect(errorsFor({ effectiveAt: "9222-09-12" }, TERMINATION).effectiveAt).toMatch(/terlalu jauh ke depan/);
    expect(errorsFor({ effectiveAt: "2113-03-14" }, TERMINATION).effectiveAt).toMatch(/Periksa angka tahunnya/);
  });
});

describe("dates that make sense", () => {
  it("accepts an ordinary onboarding", () => {
    expect(parseLifecycleRequestInput({ ...ONBOARDING, effectiveAt: "2026-10-01" }, NOW).ok).toBe(true);
  });

  it("accepts a start date recorded a little late", () => {
    expect(errorsFor({ startDate: "2026-08-01" }).startDate).toBeUndefined();
  });

  it("accepts a full ISO timestamp as well as a bare date", () => {
    expect(errorsFor({ effectiveAt: "2026-10-01T09:00:00.000+07:00" }, TERMINATION).effectiveAt).toBeUndefined();
  });

  it("refuses a day that does not exist rather than rolling it into March", () => {
    expect(checkDate("2027-02-31", "Tanggal", DATE_BOUNDS.startDate, NOW)).toMatchObject({ ok: false });
  });

  it("allows a contract to end years out, but not in year 20290", () => {
    expect(errorsFor({ employmentType: "CONTRACT", expiredDate: "2029-12-31" }).expiredDate).toBeUndefined();
    expect(errorsFor({ employmentType: "CONTRACT", expiredDate: "20290-12-31" }).expiredDate).toBeTruthy();
  });
});

describe("the other forms", () => {
  it("guards a termination's last working day", () => {
    const parsed = parseLifecycleRequestInput(
      { type: "TERMINATION", employeeId: "emp_1", reasonCategory: "RESIGN", lastWorkingDate: "20260-10-31" },
      NOW,
    );
    expect(parsed.ok ? {} : parsed.errors).toHaveProperty("lastWorkingDate");
  });

  it("guards a profile edit's contract end", () => {
    const parsed = parseEmployeeProfileInput(
      {
        firstName: "Rizky",
        lastName: "Maulana",
        displayName: "Rizky Maulana",
        jobTitle: "Engineer",
        department: "IT",
        employmentType: "CONTRACT",
        expiredDate: "132144-12-13",
      },
      NOW,
    );
    expect(parsed.ok ? {} : parsed.errors).toHaveProperty("expiredDate");
  });
});

describe("the date pickers", () => {
  it("are bounded by the same windows the server enforces", () => {
    expect(dateInputBounds(DATE_BOUNDS.effectiveAt, NOW)).toEqual({ min: "2026-08-23", max: "2027-09-22" });
  });
});

describe("when an onboarding's account is made", () => {
  function effectiveOf(overrides: Record<string, unknown>) {
    const parsed = parseLifecycleRequestInput({ ...ONBOARDING, ...overrides }, NOW);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    return parsed.value.effectiveAt;
  }

  it("is as soon as it is approved: an onboarding carries no effective date", () => {
    expect(effectiveOf({ startDate: "2026-09-22" })).toBeUndefined();
  });

  it("ignores a separate effective date, which is what stranded a start-today hire until 2027", () => {
    // The request that prompted this: start date today, effective 1 January 2027.
    expect(effectiveOf({ startDate: "2026-09-22", effectiveAt: "2027-01-01" })).toBeUndefined();
  });

  it("is not held back by a start date that is still ahead", () => {
    expect(statusAfterApproval(effectiveOf({ startDate: "2026-12-01" }), NOW)).toBe("QUEUED");
  });
});

describe("an effective date on the other forms", () => {
  it("starts at 00:00 in Jakarta, not 07:00", () => {
    const parsed = parseLifecycleRequestInput({ ...TERMINATION, effectiveAt: "2026-10-01" }, NOW);
    expect(parsed.ok && parsed.value.effectiveAt).toBe("2026-10-01T00:00:00+07:00");
  });
});
