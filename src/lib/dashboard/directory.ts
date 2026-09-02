import { employeeStatusLabel } from "@/components/ui/StatusBadge";
import type { Employee, EmployeeStatus } from "@/lib/types";

/**
 * Filtering, sorting and export for the employee directory.
 *
 * Kept out of the table component because it is the part with actual rules in
 * it — what "sorted by status" means, what a search term matches — and those
 * are worth reading without a hundred lines of JSX around them.
 */

export const SORT_KEYS = ["name", "department", "jobTitle", "status", "updated"] as const;

export type SortKey = (typeof SORT_KEYS)[number];

export type SortDirection = "asc" | "desc";

export const SORT_LABELS: Record<SortKey, string> = {
  name: "Nama",
  department: "Departemen",
  jobTitle: "Jabatan",
  status: "Status",
  updated: "Terakhir diperbarui",
};

/**
 * `PENDING` is not an employee status — it is every status that means somebody
 * still has to act. It exists because "show me what is stuck" is the question
 * the directory gets asked most, and answering it otherwise means ticking four
 * separate boxes.
 */
export type StatusFilter = EmployeeStatus | "ALL" | "PENDING";

export interface DirectoryFilters {
  query: string;
  status: StatusFilter;
  department: string | "ALL";
  sort: SortKey;
  direction: SortDirection;
}

export const DEFAULT_FILTERS: DirectoryFilters = {
  query: "",
  status: "ALL",
  department: "ALL",
  sort: "name",
  direction: "asc",
};

export function isDefaultFilters(filters: DirectoryFilters): boolean {
  return (
    filters.query.trim() === "" && filters.status === "ALL" && filters.department === "ALL"
  );
}

/**
 * Sort order for the status column.
 *
 * Alphabetical would be useless here — it would file "Aktif" above "Menunggu
 * manager" purely on the letter A. Sorting ascending puts what needs a human
 * first: things waiting on someone, then things that are fine, then things that
 * are over.
 */
const STATUS_WEIGHT: Record<EmployeeStatus, number> = {
  PENDING_MANAGER_APPROVAL: 0,
  PENDING_TRANSFER_APPROVAL: 1,
  PENDING_SECURITY_SETUP: 2,
  PENDING_TRANSFER_SETUP: 3,
  ACTIVE: 4,
  DISABLED: 5,
  REJECTED: 6,
};

/** Statuses that mean somebody, somewhere, still has to act. */
export function isPending(status: EmployeeStatus): boolean {
  return (
    status === "PENDING_MANAGER_APPROVAL" ||
    status === "PENDING_SECURITY_SETUP" ||
    status === "PENDING_TRANSFER_APPROVAL" ||
    status === "PENDING_TRANSFER_SETUP"
  );
}

/** Every department present in the roster, for the filter's options. */
export function departmentsOf(employees: Employee[]): string[] {
  return [...new Set(employees.map((employee) => employee.department))].sort((a, b) =>
    a.localeCompare(b, "id"),
  );
}

function matchesQuery(employee: Employee, needle: string): boolean {
  return [
    employee.displayName,
    employee.email,
    employee.jobTitle,
    employee.department,
    employee.managerName,
  ]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export function filterEmployees(
  employees: Employee[],
  filters: Pick<DirectoryFilters, "query" | "status" | "department">,
): Employee[] {
  const needle = filters.query.trim().toLowerCase();

  return employees.filter((employee) => {
    if (filters.status === "PENDING") {
      if (!isPending(employee.status)) return false;
    } else if (filters.status !== "ALL" && employee.status !== filters.status) {
      return false;
    }
    if (filters.department !== "ALL" && employee.department !== filters.department) return false;
    if (!needle) return true;
    return matchesQuery(employee, needle);
  });
}

export function sortEmployees(
  employees: Employee[],
  sort: SortKey,
  direction: SortDirection,
): Employee[] {
  const factor = direction === "asc" ? 1 : -1;

  // A copy: sorting the caller's array in place would mutate the props React
  // just handed us.
  return [...employees].sort((a, b) => {
    let comparison = 0;

    switch (sort) {
      case "name":
        comparison = a.displayName.localeCompare(b.displayName, "id");
        break;
      case "department":
        comparison = a.department.localeCompare(b.department, "id");
        break;
      case "jobTitle":
        comparison = a.jobTitle.localeCompare(b.jobTitle, "id");
        break;
      case "status":
        comparison = STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status];
        break;
      case "updated":
        // Newest first when ascending — "most recently touched" is what someone
        // sorting by date is looking for, so it needs no second click.
        comparison = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
        break;
    }

    // Ties fall back to the name, so the order is stable and predictable rather
    // than whatever the roster happened to arrive in.
    if (comparison === 0 && sort !== "name") {
      return a.displayName.localeCompare(b.displayName, "id");
    }
    return comparison * factor;
  });
}

/** Wraps a cell in quotes and doubles any quotes inside it, per RFC 4180. */
function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/**
 * The visible rows as a spreadsheet, in whatever order the user sorted them.
 *
 * Prefixed with a BOM because Excel otherwise reads UTF-8 as the local codepage
 * and mangles every name with an accent in it.
 */
export function toCsv(employees: Employee[]): string {
  const header = ["Nama", "Email", "Jabatan", "Departemen", "Manager", "Email manager", "Status"];

  const rows = employees.map((employee) =>
    [
      employee.displayName,
      employee.email,
      employee.jobTitle,
      employee.department,
      employee.managerName,
      employee.managerEmail,
      employeeStatusLabel(employee.status),
    ]
      .map(csvCell)
      .join(","),
  );

  return `﻿${[header.map(csvCell).join(","), ...rows].join("\r\n")}`;
}
