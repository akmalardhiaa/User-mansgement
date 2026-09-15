"use client";

import { useCallback, useMemo, useState } from "react";

import { DirectoryToolbar } from "@/components/dashboard/DirectoryToolbar";
import { EmployeeTable } from "@/components/dashboard/EmployeeTable";
import { RoleSimulatorBanner, type SimulatedRole } from "@/components/dashboard/RoleSimulatorBanner";
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
import type { Employee, ApprovalReference } from "@/lib/types";

export function DirectoryView({
  employees,
  activeTickets,
  dataSource,
  onChanged,
}: {
  employees: Employee[];
  activeTickets: Record<string, ApprovalReference | undefined>;
  dataSource?: DashboardDataSource;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [filters, setFilters] = useState<DirectoryFilters>(DEFAULT_FILTERS);
  const [exporting, setExporting] = useState(false);
  const [simulatedRole, setSimulatedRole] = useState<SimulatedRole>("HC_ADMIN");

  const departments = useMemo(() => departmentsOf(employees), [employees]);

  const visible = useMemo(() => {
    let filteredList = filterEmployees(employees, filters);
    if (simulatedRole === "MANAGER") {
      filteredList = filteredList.filter(
        (e) => e.department === "Technology" || e.status === "PENDING_MANAGER_APPROVAL",
      );
    } else if (simulatedRole === "SECURITY") {
      filteredList = filteredList.filter(
        (e) => e.status === "PENDING_SECURITY_SETUP" || e.status === "ACTIVE",
      );
    }
    return sortEmployees(filteredList, filters.sort, filters.direction);
  }, [employees, filters, simulatedRole]);

  const change = useCallback((next: Partial<DirectoryFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
  }, []);

  const reset = useCallback(() => {
    setFilters((current) => ({ ...DEFAULT_FILTERS, sort: current.sort, direction: current.direction }));
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
      <RoleSimulatorBanner onRoleChange={(role) => setSimulatedRole(role)} />

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
