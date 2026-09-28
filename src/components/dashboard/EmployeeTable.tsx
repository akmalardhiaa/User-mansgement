"use client";

import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";

import { PendingBadge } from "@/components/dashboard/PendingBadge";

/*
 * The drawer and the report are loaded when somebody opens one, not before.
 *
 * Both are mounted unconditionally below and return null until an employee is
 * selected, so they cost nothing to render — but a static import puts their
 * code in the dashboard's bundle for every visitor, including the majority who
 * never open either. Between them that is roughly 19 KB of source on the
 * critical path of the page people land on.
 *
 * `ssr: false` because neither can appear until a click has happened, so there
 * is no first paint for them to be part of.
 */
const EmployeeDetailDrawer = dynamic(
  () => import("@/components/dashboard/EmployeeDetailDrawer").then((m) => m.EmployeeDetailDrawer),
  { ssr: false },
);

const EmployeeReportModal = dynamic(
  () => import("@/components/dashboard/EmployeeReportModal").then((m) => m.EmployeeReportModal),
  { ssr: false },
);
import { Button } from "@/components/ui/Button";
import { IconArrowUp, IconSearch, IconSwap } from "@/components/ui/Icons";
import { useT } from "@/components/i18n/LocaleProvider";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { isNewEmployee, type SortDirection, type SortKey } from "@/lib/dashboard/directory";
import { sortLabel } from "@/lib/i18n/labels";
import type { PendingByEmployee } from "@/lib/lifecycle/pending";
import { TRANSITION, TRANSITION_FAST } from "@/lib/motion";
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

/** Marks somebody whose account was created in the last day. */
function NewBadge() {
  const t = useT();

  return (
    <span className="shrink-0 rounded-md border border-ok/30 bg-ok/10 px-1.5 py-0.5 text-[10px] font-semibold text-ok">
      {t.directory.newBadge}
    </span>
  );
}

/** Columns that map onto a sort key, so their headers are buttons. */
const COLUMNS: ReadonlyArray<{ key: SortKey; className?: string }> = [
  { key: "name" },
  { key: "jobTitle" },
  { key: "department" },
  { key: "status" },
];

/**
 * Nothing to show, and which of the two reasons it is.
 *
 * Lifted out of the table body, because the table is hidden on a narrow screen
 * and an empty state that only exists inside it would leave a phone staring at
 * blank space — the one moment the reader most needs to be told something.
 */
function EmptyState({ filtered, onReset }: { filtered: boolean; onReset: () => void }) {
  const t = useT();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={TRANSITION}
      className="flex flex-col items-center gap-3 px-4 py-16 text-center"
    >
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
          ? t.directory.emptyFiltered
          : t.directory.emptyDirectory}
      </p>
      {filtered ? (
        <Button variant="ghost" size="sm" onClick={onReset}>
          Hapus semua filter
        </Button>
      ) : null}
    </motion.div>
  );
}

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
  const t = useT();
  const [drawerEmployee, setDrawerEmployee] = useState<Employee | null>(null);
  const [reportEmployee, setReportEmployee] = useState<Employee | null>(null);

  return (
    <div className="relative">
      <EmployeeDetailDrawer
        employee={drawerEmployee}
        pending={drawerEmployee ? pending[drawerEmployee.id] : undefined}
        canRequest={canRequest}
        onClose={() => setDrawerEmployee(null)}
        onOpenReportPDF={(employee) => setReportEmployee(employee)}
      />

      <EmployeeReportModal employee={reportEmployee} onClose={() => setReportEmployee(null)} />

      {employees.length === 0 ? <EmptyState filtered={filtered} onReset={onReset} /> : null}

      {/*
       * Below `lg` the roster is a list of cards, not a table.
       *
       * Six columns need 58rem to sit side by side without being crushed, so on a
       * phone this was a desktop table you dragged sideways: roughly two fifths of
       * a row visible at a time, and a horizontal scroll for every person you
       * wanted to read. Nothing is lost by hiding it — sorting lives in the
       * toolbar above rather than in these column headers, so it stays reachable.
       */}
      {employees.length > 0 ? (
        <ul className="divide-y divide-hairline/60 lg:hidden">
          <AnimatePresence initial={false}>
            {employees.map((employee, index) => {
              const marker = pending[employee.id];
              return (
                <motion.li
                  key={employee.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    transition: { ...TRANSITION, delay: Math.min(index * 0.025, 0.24) },
                  }}
                  exit={{ opacity: 0, y: -6, transition: TRANSITION_FAST }}
                  onClick={() => setDrawerEmployee(employee)}
                  className="cursor-pointer px-4 py-3.5 transition-colors hover:bg-elevated/50"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full border border-hairline-strong bg-elevated text-xs font-semibold text-ink-muted">
                      {initials(employee.displayName)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate font-medium text-ink">
                        <span className="truncate">{employee.displayName}</span>
                        {isNewEmployee(employee) ? <NewBadge /> : null}
                      </p>
                      <p className="truncate text-xs text-ink-faint">{employee.email}</p>
                    </div>
                    <StatusBadge status={employee.status} />
                  </div>

                  <p className="mt-2 pl-12 text-xs break-words text-ink-muted">
                    {employee.jobTitle} · {employee.department}
                  </p>

                  <div
                    className="mt-2.5 flex flex-wrap items-center gap-2 pl-12"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {marker ? <PendingBadge marker={marker} /> : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDrawerEmployee(employee)}
                      title={t.directory.detailHint}
                    >
                      {t.directory.detail}
                    </Button>
                    {canRequest && !marker ? (
                      <Link
                        href={`/users/edit?action=movement&employeeId=${employee.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-elevated px-2.5 py-1.5 text-xs font-medium text-ink transition-colors hover:border-accent/50"
                      >
                        <IconSwap className="size-3.5" />
                        {t.directory.proposeChange}
                      </Link>
                    ) : null}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      ) : null}

      <div className="hidden overflow-x-auto lg:block">
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
                    {sortLabel(t, column.key)}
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
              {t.directory.columnPending}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              {t.directory.columnActions}
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
                  /*
                   * No `layout` prop. It made Framer measure every row against
                   * its previous box on each layout pass, so typing in the
                   * filter box put a full measure-and-compare cycle over the
                   * whole table between every keystroke. Rows still fade and
                   * rise in, and still fade out; what they no longer do is
                   * slide from where a different row used to be — which nobody
                   * was watching for, at the price of the thing that made
                   * searching feel heavy.
                   */
                  onClick={() => setDrawerEmployee(employee)}
                  className="group cursor-pointer border-b border-hairline/60 transition-[background-color,box-shadow] duration-200 ease-(--ease-out-quint) last:border-0 hover:bg-elevated/50 hover:shadow-[inset_2px_0_0_0_var(--color-accent)]"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-hairline-strong bg-elevated text-xs font-semibold text-ink-muted transition-[color,border-color,scale] duration-200 ease-(--ease-out-quint) group-hover:scale-105 group-hover:border-accent/50 group-hover:text-accent">
                        {initials(employee.displayName)}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-medium text-ink transition-colors group-hover:text-accent">
                          <span className="truncate">{employee.displayName}</span>
                          {isNewEmployee(employee) ? <NewBadge /> : null}
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
                        title={t.directory.detailHint}
                      >
                        {t.directory.detail}
                      </Button>
                      {canRequest && !marker ? (
                        <Link
                          href={`/users/edit?action=movement&employeeId=${employee.id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-elevated px-2.5 py-1.5 text-xs font-medium text-ink transition-colors hover:border-accent/50"
                          title={t.directory.proposeChangeHint}
                        >
                          <IconSwap className="size-3.5" />
                          {t.directory.proposeChange}
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </AnimatePresence>
        </tbody>
      </table>
      </div>
    </div>
  );
}
