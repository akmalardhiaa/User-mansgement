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
  const [exporting, setExporting] = useState(false);

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

  /**
   * The workbook is built on the server: ExcelJS is about a megabyte, and
   * shipping it to every visitor to save one request would cost every page load
   * in the app. Only the filter state crosses the wire — the server re-runs the
   * same filter and sort, so the file matches the screen.
   */
  async function exportWorkbook() {
    if (exporting) return;
    setExporting(true);
    try {
      const response = await fetch("/api/directory/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters }),
      });
      if (!response.ok) throw new Error("Ekspor gagal.");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      // Taken from the response, so the server names the file and the client
      // never has to guess at the extension it is about to save.
      link.download =
        response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        `direktori-karyawan-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      toast(`${visible.length} baris diekspor ke Excel.`, "info");
    } catch (cause) {
      toast((cause as Error).message, "error");
    } finally {
      setExporting(false);
    }
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
            onExport={exportWorkbook}
            exporting={exporting}
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
