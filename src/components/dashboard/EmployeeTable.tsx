"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";

import { EmployeeDetailDrawer } from "@/components/dashboard/EmployeeDetailDrawer";
import { EmployeeReportModal } from "@/components/dashboard/EmployeeReportModal";
import { PendingBadge } from "@/components/dashboard/PendingBadge";
import { Button } from "@/components/ui/Button";
import { IconArrowUp, IconSearch, IconSwap } from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SORT_LABELS, type SortDirection, type SortKey } from "@/lib/dashboard/directory";
import type { PendingByEmployee } from "@/lib/lifecycle/pending";
import { TRANSITION, TRANSITION_FAST, TRANSITION_LAYOUT } from "@/lib/motion";
import type { Employee } from "@/lib/types";

interface EmployeeTableProps {
  /** Already filtered and sorted by the parent. */
  employees: Employee[];
  /** Open lifecycle requests, keyed by the employee they concern. */
  pending: PendingByEmployee;
  sort: SortKey;
  direction: SortDirection;
  /** Clicking a column header. Same key again flips the direction. */
  onSort: (key: SortKey) => void;
  /** Clears every filter, offered from the empty state. */
  onReset: () => void;
  /** True when a filter is hiding rows, which changes what "no results" means. */
  filtered: boolean;
  /** Whether this viewer may raise a lifecycle request. */
  canRequest?: boolean;
}

/**
 * The roster.
 *
 * Read-only, deliberately. Three things used to be possible from these rows and
 * none of them are any more:
 *
 *   - an access toggle that switched somebody's account on or off with nothing
 *     but a click behind it;
 *   - an inline editor that moved a person between divisions;
 *   - a bulk action bar whose buttons showed a success message and changed
 *     nothing at all.
 *
 * The first two now require a manager's and the CISO's approval, so they start
 * as a request. The third was never real and is simply gone — a control that
 * reports success without acting is worse than no control.
 */
function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** Columns that map onto a sort key, so their headers are buttons. */
const COLUMNS: ReadonlyArray<{ key: SortKey; className?: string }> = [
  { key: "name" },
  { key: "jobTitle" },
  { key: "department" },
  { key: "status" },
];

export function EmployeeTable({
  employees,
  pending,
  sort,
  direction,
  onSort,
  onReset,
  filtered,
  canRequest = false,
}: EmployeeTableProps) {
  const [drawerEmployee, setDrawerEmployee] = useState<Employee | null>(null);
  const [reportEmployee, setReportEmployee] = useState<Employee | null>(null);

  return (
    <div className="relative overflow-x-auto">
      <EmployeeDetailDrawer
        employee={drawerEmployee}
        pending={drawerEmployee ? pending[drawerEmployee.id] : undefined}
        canRequest={canRequest}
        onClose={() => setDrawerEmployee(null)}
        onOpenReportPDF={(employee) => setReportEmployee(employee)}
      />

      <EmployeeReportModal employee={reportEmployee} onClose={() => setReportEmployee(null)} />

      <table className="w-full min-w-[58rem] text-left text-sm">
        <thead>
          <tr className="border-b border-hairline text-xs tracking-wide text-ink-faint uppercase">
            {COLUMNS.map((column) => {
              const isSorted = sort === column.key;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={isSorted ? (direction === "asc" ? "ascending" : "descending") : "none"}
                  className="px-4 py-3 font-medium"
                >
                  <button
                    type="button"
                    onClick={() => onSort(column.key)}
                    className={`group inline-flex items-center gap-1.5 uppercase transition-colors hover:text-ink ${
                      isSorted ? "text-ink" : ""
                    }`}
                  >
                    {SORT_LABELS[column.key]}
                    <motion.span
                      animate={{
                        opacity: isSorted ? 1 : 0,
                        rotate: isSorted && direction === "desc" ? 180 : 0,
                      }}
                      transition={TRANSITION_FAST}
                      className="text-accent group-hover:opacity-60"
                    >
                      <IconArrowUp className="size-3" />
                    </motion.span>
                  </button>
                </th>
              );
            })}
            <th scope="col" className="px-4 py-3 font-medium">
              Pengajuan berjalan
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Tindakan
            </th>
          </tr>
        </thead>

        <tbody>
          <AnimatePresence initial={false}>
            {employees.map((employee, index) => {
              const marker = pending[employee.id];
              return (
                <motion.tr
                  key={employee.id}
                  initial={{ opacity: 0, y: 10, scale: 0.99 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    transition: { ...TRANSITION, delay: Math.min(index * 0.025, 0.24) },
                  }}
                  exit={{ opacity: 0, y: -6, transition: TRANSITION_FAST }}
                  layout="position"
                  transition={TRANSITION_LAYOUT}
                  onClick={() => setDrawerEmployee(employee)}
                  className="group cursor-pointer border-b border-hairline/60 transition-[background-color,box-shadow] duration-200 ease-(--ease-out-quint) last:border-0 hover:bg-elevated/50 hover:shadow-[inset_2px_0_0_0_var(--color-accent)]"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-hairline-strong bg-elevated text-xs font-semibold text-ink-muted transition-[color,border-color,scale] duration-200 ease-(--ease-out-quint) group-hover:scale-105 group-hover:border-accent/50 group-hover:text-accent">
                        {initials(employee.displayName)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink transition-colors group-hover:text-accent">
                          {employee.displayName}
                        </span>
                        <span className="block truncate text-xs text-ink-faint">
                          {employee.email}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{employee.jobTitle}</td>
                  <td className="px-4 py-3 text-ink-muted">{employee.department}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={employee.status} />
                  </td>
                  <td className="px-4 py-3">
                    {marker ? (
                      <PendingBadge marker={marker} />
                    ) : (
                      <span className="text-xs text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                    <div className="flex justify-end gap-2 whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDrawerEmployee(employee)}
                        title="Lihat profil detail karyawan"
                      >
                        Detail
                      </Button>
                      {canRequest && !marker ? (
                        <Link
                          href={`/pengajuan/baru?type=MOVEMENT&employeeId=${employee.id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-elevated px-2.5 py-1.5 text-xs font-medium text-ink transition-colors hover:border-accent/50"
                          title="Ajukan perpindahan divisi — melewati persetujuan manager dan CISO"
                        >
                          <IconSwap className="size-3.5" />
                          Ajukan perubahan
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </AnimatePresence>

          {employees.length === 0 ? (
            <motion.tr
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={TRANSITION}
            >
              <td colSpan={6} className="px-4 py-16">
                <div className="flex flex-col items-center gap-3 text-center">
                  <motion.span
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ ...TRANSITION, delay: 0.06 }}
                    className="grid size-12 place-items-center rounded-full border border-hairline bg-elevated/60 text-ink-faint"
                  >
                    <IconSearch className="size-5" />
                  </motion.span>
                  <p className="text-sm text-ink-muted">
                    {filtered
                      ? "Tidak ada karyawan yang cocok dengan filter ini."
                      : "Direktori masih kosong."}
                  </p>
                  {filtered ? (
                    <Button variant="ghost" size="sm" onClick={onReset}>
                      Hapus semua filter
                    </Button>
                  ) : null}
                </div>
              </td>
            </motion.tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
