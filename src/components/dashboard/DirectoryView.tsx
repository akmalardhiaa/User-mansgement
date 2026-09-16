"use client";

import { useCallback, useMemo, useState } from "react";

import { DirectoryToolbar } from "@/components/dashboard/DirectoryToolbar";
import { EmployeeTable } from "@/components/dashboard/EmployeeTable";
import { StatsRow } from "@/components/dashboard/StatsRow";
import { Reveal } from "@/components/motion/Reveal";
import { Card } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import {
  DEFAULT_FILTERS,
  departmentsOf,
  filterEmployees,
  isDefaultFilters,
  sortEmployees,
  type DirectoryFilters,
  type SortKey,
} from "@/lib/dashboard/directory";
import type { PendingByEmployee } from "@/lib/lifecycle/pending";
import type { Employee } from "@/lib/types";

/**
 * The directory.
 *
 * The role simulator that used to sit at the top of this view is gone. It was a
 * switcher offering "HC Admin / Manager / IT Security", and picking one filtered
 * the rows client-side — so it looked like an access control and was nothing of
 * the kind: every row was already in the browser, and the backend was never told
 * which role had supposedly been chosen. Authority now comes from the signed-in
 * session's roles, checked on the server for every page and every handler.
 */
export function DirectoryView({
  employees,
  pending,
  canRequest = false,
}: {
  employees: Employee[];
  /** Open lifecycle requests, keyed by the employee they concern. */
  pending: PendingByEmployee;
  /** Whether this viewer may raise a lifecycle request. */
  canRequest?: boolean;
}) {
  const { toast } = useToast();
  const [filters, setFilters] = useState<DirectoryFilters>(DEFAULT_FILTERS);
  const [exporting, setExporting] = useState(false);

  const departments = useMemo(() => departmentsOf(employees), [employees]);

  // Which people have something in flight. Derived from the requests, never
  // from the roster: the directory describes accounts, not intentions.
  const pendingIds = useMemo(() => new Set(Object.keys(pending)), [pending]);

  const visible = useMemo(
    () => sortEmployees(filterEmployees(employees, filters, pendingIds), filters.sort, filters.direction),
    [employees, filters, pendingIds],
  );

  const change = useCallback((next: Partial<DirectoryFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
  }, []);

  const reset = useCallback(() => {
    setFilters((current) => ({
      ...DEFAULT_FILTERS,
      sort: current.sort,
      direction: current.direction,
    }));
  }, []);

  const sortBy = useCallback((key: SortKey) => {
    setFilters((current) =>
      current.sort === key
        ? { ...current, direction: current.direction === "asc" ? "desc" : "asc" }
        : { ...current, sort: key, direction: "asc" },
    );
  }, []);

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
        pendingCount={pendingIds.size}
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
            pending={pending}
            canRequest={canRequest}
            sort={filters.sort}
            direction={filters.direction}
            onSort={sortBy}
            onReset={reset}
            filtered={!isDefaultFilters(filters)}
          />
        </Card>
      </Reveal>
    </div>
  );
}
