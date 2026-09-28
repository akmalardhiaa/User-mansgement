import { employeeStatusLabel } from "@/components/ui/StatusBadge";
import { EMPLOYEE_STATUSES, type Employee, type EmployeeStatus } from "@/lib/types";

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
 * `PENDING` is not an account status — it means "has a lifecycle request still
 * in flight". It stays in the filter because "show me what is waiting on
 * somebody" is the question the directory gets asked most, but it is now
 * answered from the requests rather than from the roster, which is where that
 * fact actually lives.
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
  /*
   * Most recently changed first, not A–Z. Sorted by name, a new hire the worker
   * had just created landed somewhere in the middle of the roster, and HC —
   * looking at the top of the page for the person they had just onboarded —
   * concluded it had not worked. Clicking "Nama" still sorts alphabetically.
   */
  sort: "updated",
  direction: "asc",
};

const NEW_FOR_MS = 24 * 60 * 60 * 1000;

/** Created in the last day — flagged in the table so a new hire is easy to spot. */
export function isNewEmployee(employee: Pick<Employee, "createdAt">, now = Date.now()): boolean {
  const created = Date.parse(employee.createdAt);
  return Number.isFinite(created) && now - created >= 0 && now - created < NEW_FOR_MS;
}

/**
 * Coerces anything that arrives over the wire into a usable filter.
 *
 * The UI can only ever produce valid values, but the export endpoint takes the
 * filter as a request body, and an unrecognised status used to reach
 * `employeeStatusLabel` — which indexes a Record and returned undefined, so the
 * route answered 500 where every other endpoint answers 400. Unknown values are
 * dropped to their default rather than rejected: a filter is a view, and the
 * worst an unreadable one deserves is the unfiltered list.
 */
export function sanitiseFilters(input: unknown): DirectoryFilters {
  const raw = (input ?? {}) as Partial<Record<keyof DirectoryFilters, unknown>>;
  const oneOf = <T extends string>(value: unknown, allowed: ReadonlyArray<T>, fallback: T): T =>
    typeof value === "string" && (allowed as ReadonlyArray<string>).includes(value)
      ? (value as T)
      : fallback;

  return {
    query: typeof raw.query === "string" ? raw.query.slice(0, 200) : DEFAULT_FILTERS.query,
    status: oneOf<StatusFilter>(
      raw.status,
      ["ALL", "PENDING", ...EMPLOYEE_STATUSES],
      DEFAULT_FILTERS.status,
    ),
    // Departments are free text by design, so anything printable is allowed —
    // it simply matches nobody when it is not a real division.
    department:
      typeof raw.department === "string" && raw.department.length <= 200
        ? raw.department
        : DEFAULT_FILTERS.department,
    sort: oneOf<SortKey>(raw.sort, SORT_KEYS, DEFAULT_FILTERS.sort),
    direction: oneOf<SortDirection>(raw.direction, ["asc", "desc"], DEFAULT_FILTERS.direction),
  };
}

export function isDefaultFilters(filters: DirectoryFilters): boolean {
  return (
    filters.query.trim() === "" && filters.status === "ALL" && filters.department === "ALL"
  );
}

/** Active first: a working account is the ordinary case and reads first. */
const STATUS_WEIGHT: Record<EmployeeStatus, number> = {
  ACTIVE: 0,
  DISABLED: 1,
};

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

/**
 * @param pendingIds employees with a lifecycle request still in flight. Only
 *   consulted by the `PENDING` filter; omitted, that filter simply matches
 *   nobody rather than throwing, which is the right answer for a caller that
 *   has no request data to hand.
 */
export function filterEmployees(
  employees: Employee[],
  filters: Pick<DirectoryFilters, "query" | "status" | "department">,
  pendingIds: ReadonlySet<string> = new Set(),
): Employee[] {
  const needle = filters.query.trim().toLowerCase();

  return employees.filter((employee) => {
    if (filters.status === "PENDING") {
      if (!pendingIds.has(employee.id)) return false;
    } else if (filters.status !== "ALL" && employee.status !== filters.status) {
      return false;
    }
    if (filters.department !== "ALL" && employee.department !== filters.department) return false;

    /*
     * Disabled accounts are out of the way until they are asked for.
     *
     * Most of the roster ends up disabled over time — people leave, and the
     * record stays — so a list of everyone is mostly a list of people who no
     * longer work here, and the person HC is looking for is somewhere below it.
     * They are never unreachable: a search finds them, and so does choosing
     * "Nonaktif" in the status filter. Only the default view leaves them out.
     */
    if (filters.status === "ALL" && !needle && employee.status !== "ACTIVE") return false;

    if (!needle) return true;
    return matchesQuery(employee, needle);
  });
}

/** How many disabled accounts the default view is currently leaving out. */
export function hiddenInactiveCount(
  employees: Employee[],
  filters: Pick<DirectoryFilters, "query" | "status">,
): number {
  if (filters.status !== "ALL" || filters.query.trim() !== "") return 0;
  return employees.filter((employee) => employee.status !== "ACTIVE").length;
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
    /*
     * Working accounts first, always, whichever column is sorted and whichever
     * way round. A disabled account is a record rather than a colleague, and
     * mixing the two by name puts somebody who left last year between two
     * people HC is trying to compare. Reversing the direction reverses the
     * order within each group, not the groups themselves.
     */
    const byStatus = STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status];
    if (byStatus !== 0) return byStatus;

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
