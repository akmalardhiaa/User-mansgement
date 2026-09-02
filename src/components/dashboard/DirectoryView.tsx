"use client";

import { useCallback, useMemo, useState } from "react";

import { DirectoryToolbar } from "@/components/dashboard/DirectoryToolbar";
import { EmployeeTable } from "@/components/dashboard/EmployeeTable";
import { StatsRow } from "@/components/dashboard/StatsRow";
import { Reveal } from "@/components/motion/Reveal";
import { Card } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import type { DashboardDataSource } from "@/lib/client/dataSource";
import {
  DEFAULT_FILTERS,
  departmentsOf,
  filterEmployees,
  isDefaultFilters,
  sortEmployees,
  toCsv,
  type DirectoryFilters,
  type SortKey,
} from "@/lib/dashboard/directory";
import type { Employee, JiraIssueRef } from "@/lib/types";

/**
 * The directory: headline counts, the filter bar, and the table, sharing one
 * piece of filter state.
 *
 * They live together because they are three views of the same question. The
 * stat cards set the status filter, the toolbar narrows it further, and the
 * table's own column headers drive the sort — none of which is possible while
 * each component keeps its own private copy of what the user asked for.
 */
export function DirectoryView({
  employees,
  activeTickets,
  dataSource,
  onChanged,
}: {
  employees: Employee[];
  activeTickets: Record<string, JiraIssueRef | undefined>;
  dataSource?: DashboardDataSource;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [filters, setFilters] = useState<DirectoryFilters>(DEFAULT_FILTERS);

  const departments = useMemo(() => departmentsOf(employees), [employees]);

  const visible = useMemo(
    () => sortEmployees(filterEmployees(employees, filters), filters.sort, filters.direction),
    [employees, filters],
  );

  const change = useCallback((next: Partial<DirectoryFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
  }, []);

  const reset = useCallback(() => {
    // Keeps the sort. Resetting is about clearing what is hidden, not about
    // throwing away the order the user chose to read it in.
    setFilters((current) => ({ ...DEFAULT_FILTERS, sort: current.sort, direction: current.direction }));
  }, []);

  /** A column header: same column flips direction, a new one starts ascending. */
  const sortBy = useCallback((key: SortKey) => {
    setFilters((current) =>
      current.sort === key
        ? { ...current, direction: current.direction === "asc" ? "desc" : "asc" }
        : { ...current, sort: key, direction: "asc" },
    );
  }, []);

  function exportCsv() {
    const blob = new Blob([toCsv(visible)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `direktori-karyawan-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    // Revoking immediately is safe: the browser has already taken its own
    // reference by the time `click()` returns.
    URL.revokeObjectURL(url);
    toast(`${visible.length} baris diekspor ke CSV.`, "info");
  }

  return (
    <div className="space-y-6">
      <StatsRow
        employees={employees}
        active={filters.status}
        onSelect={(status) => change({ status })}
      />

      <Reveal delay={0.08}>
        <Card className="overflow-hidden">
          <DirectoryToolbar
            filters={filters}
            onChange={change}
            onReset={reset}
            onExport={exportCsv}
            departments={departments}
            shown={visible.length}
            total={employees.length}
          />
          <EmployeeTable
            employees={visible}
            activeTickets={activeTickets}
            sort={filters.sort}
            direction={filters.direction}
            onSort={sortBy}
            onReset={reset}
            filtered={!isDefaultFilters(filters)}
            dataSource={dataSource}
            onChanged={onChanged}
          />
        </Card>
      </Reveal>
    </div>
  );
}
