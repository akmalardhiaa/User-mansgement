import { describe, expect, it } from "vitest";

import type { Employee } from "@/lib/types";

import {
  DEFAULT_FILTERS,
  filterEmployees,
  hiddenInactiveCount,
  isNewEmployee,
  sortEmployees,
} from "./directory";

function person(displayName: string, at: string): Employee {
  return {
    id: displayName,
    firstName: displayName,
    lastName: "",
    displayName,
    email: `${displayName.toLowerCase()}@example.com`,
    jobTitle: "Staff",
    department: "HC",
    managerName: "Sarah",
    managerEmail: "sarah@example.com",
    status: "ACTIVE",
    createdAt: at,
    updatedAt: at,
  };
}

describe("the directory's default order", () => {
  it("puts somebody just created at the top, not somewhere in A–Z", () => {
    // "Zahra" was created by the worker a moment ago. Sorted by name she landed
    // last, and HC concluded the new hire had never been made.
    const roster = [
      person("Ayu", "2026-01-06T09:00:00.000Z"),
      person("Zahra", "2026-09-22T03:24:57.000Z"),
      person("Budi", "2026-03-01T09:00:00.000Z"),
    ];

    const shown = sortEmployees(roster, DEFAULT_FILTERS.sort, DEFAULT_FILTERS.direction);
    expect(shown.map((employee) => employee.displayName)).toEqual(["Zahra", "Budi", "Ayu"]);
  });
});

describe("the 'Baru' badge", () => {
  const now = Date.parse("2026-09-22T07:45:00.000Z");

  it("marks an account created in the last day", () => {
    expect(isNewEmployee({ createdAt: "2026-09-22T03:24:57.000Z" }, now)).toBe(true);
  });

  it("does not mark one from last week, or one with no usable date", () => {
    expect(isNewEmployee({ createdAt: "2026-09-15T07:36:21.617Z" }, now)).toBe(false);
    expect(isNewEmployee({ createdAt: "bukan tanggal" }, now)).toBe(false);
  });
});

describe("disabled accounts in the default view", () => {
  const roster = [
    { ...person("Ayu", "2026-01-06T09:00:00.000Z") },
    { ...person("Clara", "2026-02-06T09:00:00.000Z"), status: "DISABLED" as const },
    { ...person("Dewi", "2026-03-06T09:00:00.000Z"), status: "DISABLED" as const },
  ];

  it("leaves them out until somebody asks for them", () => {
    const shown = filterEmployees(roster, DEFAULT_FILTERS);

    expect(shown.map((employee) => employee.displayName)).toEqual(["Ayu"]);
    expect(hiddenInactiveCount(roster, DEFAULT_FILTERS)).toBe(2);
  });

  it("finds one by name even though it is hidden", () => {
    const shown = filterEmployees(roster, { ...DEFAULT_FILTERS, query: "clara" });

    expect(shown.map((employee) => employee.displayName)).toEqual(["Clara"]);
    expect(hiddenInactiveCount(roster, { ...DEFAULT_FILTERS, query: "clara" })).toBe(0);
  });

  it("shows them all when the status filter asks for disabled", () => {
    const shown = filterEmployees(roster, { ...DEFAULT_FILTERS, status: "DISABLED" });

    expect(shown.map((employee) => employee.displayName)).toEqual(["Clara", "Dewi"]);
  });

  it("keeps working accounts above disabled ones, whichever way it is sorted", () => {
    const ascending = sortEmployees(roster, "name", "asc").map((e) => e.displayName);
    const descending = sortEmployees(roster, "name", "desc").map((e) => e.displayName);

    expect(ascending).toEqual(["Ayu", "Clara", "Dewi"]);
    // Reversed within each group; the groups themselves stay put.
    expect(descending).toEqual(["Ayu", "Dewi", "Clara"]);
  });
});
