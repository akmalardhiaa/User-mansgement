import { describe, expect, it } from "vitest";

import type { Employee } from "@/lib/types";

import { DEFAULT_FILTERS, isNewEmployee, sortEmployees } from "./directory";

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
