import { describe, expect, it } from "vitest";

import { editIntent, type EditValues } from "./editIntent";
import type { Employee } from "@/lib/types";

/**
 * One form, three requests, and the rule that decides between them.
 *
 * Worth testing rather than eyeballing: this is the only thing standing between
 * "HC changed a division" and "HC accidentally closed an account".
 */

const EMPLOYEE: Employee = {
  id: "emp-1",
  firstName: "Putri",
  lastName: "Maharani",
  displayName: "Putri Maharani",
  email: "putri.maharani@example.com",
  jobTitle: "Security Analyst",
  department: "IT — Security",
  employmentType: "CONTRACT",
  expiredDate: "2027-03-31T00:00:00.000Z",
  locationType: "PUSAT",
  managerName: "Bagus Nugroho",
  managerEmail: "bagus.nugroho@example.com",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

/** The form as it opens: everything as the record already says it is. */
const UNCHANGED: EditValues = {
  jobTitle: "Security Analyst",
  department: "IT — Security",
  managerEmail: "bagus.nugroho@example.com",
  employmentType: "CONTRACT",
  expiredDate: "2027-03-31",
  locationType: "PUSAT",
  branchName: "",
  lastWorkingDate: "",
};

const intentOf = (values: Partial<EditValues>) => editIntent(EMPLOYEE, { ...UNCHANGED, ...values });

describe("a form nobody has touched", () => {
  it("asks for nothing", () => {
    expect(intentOf({})).toBe("NONE");
  });

  it("is not fooled by an end date the record holds as a timestamp", () => {
    // The record says 2027-03-31T00:00:00.000Z and the input says 2027-03-31.
    // Comparing them as written would report a change on every visit.
    expect(intentOf({ expiredDate: "2027-03-31" })).toBe("NONE");
  });

  it("is not fooled by the case of a manager's address", () => {
    expect(intentOf({ managerEmail: "Bagus.Nugroho@example.com" })).toBe("NONE");
  });

  it("ignores whitespace somebody left behind", () => {
    expect(intentOf({ jobTitle: "Security Analyst " })).toBe("NONE");
  });
});

describe("what the directory holds", () => {
  it.each([
    ["division", { department: "Engineering" }],
    ["job title", { jobTitle: "Security Engineer" }],
    ["manager", { managerEmail: "yoga.pratama@example.com" }],
  ])("a changed %s is a Movement", (_what, values) => {
    expect(intentOf(values)).toBe("MOVEMENT");
  });
});

describe("what only the portal holds", () => {
  it.each([
    ["employment type", { employmentType: "PERMANENT" }],
    ["end date", { expiredDate: "2028-01-31" }],
    ["place of work", { locationType: "CABANG", branchName: "Cabang Surabaya" }],
  ])("a changed %s is a profile update", (_what, values) => {
    expect(intentOf(values)).toBe("PROFILE_UPDATE");
  });
});

describe("a last working day", () => {
  it("is a Termination, and nothing else needs to have changed", () => {
    expect(intentOf({ lastWorkingDate: "2026-10-31" })).toBe("TERMINATION");
  });

  it("refuses to be combined with any other edit", () => {
    // The other edit would be applied to an account about to be closed, by a
    // separate approval chain. Nobody filling this in means that.
    expect(intentOf({ lastWorkingDate: "2026-10-31", department: "Engineering" })).toBe("MIXED");
    expect(intentOf({ lastWorkingDate: "2026-10-31", locationType: "CABANG" })).toBe("MIXED");
  });
});

describe("two kinds of change at once", () => {
  it("is refused rather than guessed", () => {
    // A Movement is routed to the receiving manager and a profile update to the
    // current one. Picking either would quietly drop the other.
    expect(intentOf({ department: "Engineering", employmentType: "PERMANENT" })).toBe("MIXED");
  });
});
