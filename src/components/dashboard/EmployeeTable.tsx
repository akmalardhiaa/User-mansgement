"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import {
  IconArrowUp,
  IconBriefcase,
  IconBuilding,
  IconExternal,
  IconMail,
  IconNote,
  IconPower,
  IconSearch,
  IconSwap,
  IconUserCheck,
} from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { apiDataSource, type DashboardDataSource } from "@/lib/client/dataSource";
import { SORT_LABELS, type SortDirection, type SortKey } from "@/lib/dashboard/directory";
import { DEPARTMENTS } from "@/lib/db/seed";
import { TRANSITION_FAST, collapse } from "@/lib/motion";
import type { Employee, EmployeeStatus, JiraIssueRef } from "@/lib/types";

interface EmployeeTableProps {
  /** Already filtered and sorted by the parent. */
  employees: Employee[];
  /** The Jira ticket a still-onboarding employee is currently blocked on. */
  activeTickets: Record<string, JiraIssueRef | undefined>;
  sort: SortKey;
  direction: SortDirection;
  /** Clicking a column header. Same key again flips the direction. */
  onSort: (key: SortKey) => void;
  /** Clears every filter, offered from the empty state. */
  onReset: () => void;
  /** True when a filter is hiding rows, which changes what "no results" means. */
  filtered: boolean;
  /** Swapped for an in-browser mock by the static demo. */
  dataSource?: DashboardDataSource;
  /** Called after a successful change; defaults to refreshing the server components. */
  onChanged?: () => void;
}

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

/** Access can only be toggled once an account exists; in-flight requests cannot. */
function canToggleAccess(status: EmployeeStatus): boolean {
  return status === "ACTIVE" || status === "DISABLED";
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
  activeTickets,
  sort,
  direction,
  onSort,
  onReset,
  filtered,
  dataSource = apiDataSource,
  onChanged,
}: EmployeeTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  // The transfer is captured inline rather than in a dialog, which sandboxed
  // embeds block outright.
  const [transferring, setTransferring] = useState<string | null>(null);
  const [target, setTarget] = useState({
    department: "",
    jobTitle: "",
    managerName: "",
    managerEmail: "",
    reason: "",
  });

  function openTransfer(employee: Employee) {
    // A second click on the same row closes it, so the button is a toggle
    // rather than a one-way door.
    if (transferring === employee.id) {
      setTransferring(null);
      return;
    }
    setTransferring(employee.id);
    // Pre-fill with where they are now, so HC only edits what actually changes.
    setTarget({
      department: employee.department,
      jobTitle: employee.jobTitle,
      managerName: "",
      managerEmail: "",
      reason: "",
    });
  }

  async function requestTransfer(employee: Employee) {
    setBusyId(employee.id);
    try {
      const result = await dataSource.requestTransfer(employee.id, {
        department: target.department.trim(),
        jobTitle: target.jobTitle.trim(),
        managerName: target.managerName.trim() || undefined,
        managerEmail: target.managerEmail.trim() || undefined,
        reason: target.reason.trim() || undefined,
      });
      setTransferring(null);
      toast(
        `Pengajuan pindah divisi untuk ${employee.displayName} dikirim${
          result.managerIssue ? ` · tiket ${result.managerIssue.key}` : ""
        }.`,
      );
      refresh();
    } catch (cause) {
      toast((cause as Error).message, "error");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleAccess(employee: Employee) {
    const enabling = employee.status !== "ACTIVE";
    setBusyId(employee.id);
    try {
      await dataSource.toggleAccess(employee.id, enabling);
      toast(
        `Akses ${employee.displayName} ${enabling ? "diaktifkan" : "dinonaktifkan"}.`,
        enabling ? "success" : "info",
      );
      refresh();
    } catch (cause) {
      toast((cause as Error).message, "error");
    } finally {
      setBusyId(null);
    }
  }

  function refresh() {
    if (onChanged) {
      onChanged();
    } else {
      // Re-render the server component so the table reflects the new status.
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[58rem] text-left text-sm">
        <thead>
          <tr className="border-b border-hairline text-xs tracking-wide text-ink-faint uppercase">
            {COLUMNS.map((column) => {
              const isSorted = sort === column.key;
              return (
                <th
                  key={column.key}
                  scope="col"
                  // Announced to a screen reader, so the sort is not something
                  // only sighted users can perceive.
                  aria-sort={
                    isSorted ? (direction === "asc" ? "ascending" : "descending") : "none"
                  }
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
              Manager
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Akses
            </th>
          </tr>
        </thead>

        <tbody>
          <AnimatePresence initial={false}>
            {employees.map((employee) => {
              const ticket = activeTickets[employee.id];
              // Scoped to the row being saved. It used to include the whole
              // page's `useTransition` flag, so one toggle greyed out every
              // button in the table while the refresh came back.
              const busy = busyId === employee.id;
              const open = transferring === employee.id;

              const mainRow = (
                <motion.tr
                  key={employee.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={TRANSITION_FAST}
                  className={`border-b border-hairline/60 transition-colors last:border-0 ${
                    open ? "bg-elevated/40" : "hover:bg-elevated/50"
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-hairline-strong bg-elevated text-xs font-semibold text-ink-muted">
                        {initials(employee.displayName)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">
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
                  <td className="px-4 py-3 text-ink-muted">{employee.managerName}</td>
                  <td className="px-4 py-3 text-right">
                    {/* The nav rail leaves the table narrower than the row labels
                        want, so actions stay on one line and the table scrolls
                        rather than stacking words. */}
                    {canToggleAccess(employee.status) ? (
                      <div className="flex justify-end gap-2 whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={busy}
                          icon={<IconPower />}
                          onClick={() => toggleAccess(employee)}
                          title="Nonaktifkan akses seketika, tanpa persetujuan"
                        >
                          {employee.status === "ACTIVE" ? "Nonaktifkan" : "Aktifkan"}
                        </Button>
                        {/* Gold is reserved for the one primary action per screen, so a
                            per-row action stays outlined rather than filled. */}
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          icon={<IconSwap />}
                          aria-expanded={open}
                          onClick={() => openTransfer(employee)}
                          title="Buat tiket persetujuan di Jira untuk memindahkan divisi"
                        >
                          Ubah posisi
                        </Button>
                      </div>
                    ) : ticket ? (
                      <a
                        href={ticket.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 font-mono text-xs text-accent-soft hover:underline"
                      >
                        {ticket.key}
                        <IconExternal className="size-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-ink-faint">—</span>
                    )}
                  </td>
                </motion.tr>
              );

              /*
               * The transfer editor is its own row directly beneath the person
               * it concerns, rather than a dialog.
               *
               * The height animation lives on a div inside the cell, because a
               * <tr> ignores a height transition in every browser worth
               * supporting. The row carries only the variant *labels* — Framer
               * passes those down to the div, which means AnimatePresence waits
               * for the panel to finish collapsing before dropping the row.
               */
              const transferRow = open ? (
                <motion.tr
                  key={`${employee.id}-transfer`}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={{ hidden: {}, visible: {}, exit: {} }}
                  className="border-b border-hairline/60"
                >
                  <td colSpan={6} className="p-0">
                    <motion.div variants={collapse} className="overflow-hidden bg-info/5">
                      <div className="border-l-2 border-info/50 px-4 py-4">
                        <p className="text-sm text-ink">
                          Pindahkan <strong>{employee.displayName}</strong> dari{" "}
                          {employee.department} · {employee.jobTitle}. Perubahan baru berlaku
                          setelah manager menyetujui dan IT Security menyesuaikan aksesnya.
                        </p>

                        {/*
                         * The same Field/SelectField primitives the create-user
                         * page uses. These were hand-rolled labels wrapping bare
                         * controls, which is how they had drifted to a smaller
                         * label than every other form in the app.
                         */}
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <SelectField
                            label="Divisi tujuan"
                            name={`transfer-department-${employee.id}`}
                            icon={<IconBuilding className="size-4" />}
                            value={target.department}
                            onChange={(event) =>
                              setTarget((current) => ({
                                ...current,
                                department: event.target.value,
                              }))
                            }
                          >
                            {DEPARTMENTS.map((department) => (
                              <option key={department} value={department}>
                                {department}
                              </option>
                            ))}
                          </SelectField>
                          <Field
                            label="Posisi baru"
                            name={`transfer-jobTitle-${employee.id}`}
                            icon={<IconBriefcase className="size-4" />}
                            value={target.jobTitle}
                            onChange={(event) =>
                              setTarget((current) => ({
                                ...current,
                                jobTitle: event.target.value,
                              }))
                            }
                            placeholder="Security Analyst"
                          />
                          <Field
                            label="Alasan (opsional)"
                            name={`transfer-reason-${employee.id}`}
                            icon={<IconNote className="size-4" />}
                            value={target.reason}
                            onChange={(event) =>
                              setTarget((current) => ({ ...current, reason: event.target.value }))
                            }
                            placeholder="Rotasi internal"
                          />
                          <Field
                            label="Nama manager baru (opsional)"
                            name={`transfer-managerName-${employee.id}`}
                            icon={<IconUserCheck className="size-4" />}
                            value={target.managerName}
                            onChange={(event) =>
                              setTarget((current) => ({
                                ...current,
                                managerName: event.target.value,
                              }))
                            }
                            placeholder="Bagus Nugroho"
                          />
                          <Field
                            label="Email manager baru (opsional)"
                            name={`transfer-managerEmail-${employee.id}`}
                            type="email"
                            icon={<IconMail className="size-4" />}
                            value={target.managerEmail}
                            onChange={(event) =>
                              setTarget((current) => ({
                                ...current,
                                managerEmail: event.target.value,
                              }))
                            }
                            placeholder="bagus.nugroho@example.com"
                          />
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3">
                          <Button loading={busy} onClick={() => requestTransfer(employee)}>
                            Ajukan pindah divisi
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => setTransferring(null)}
                          >
                            Batal
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  </td>
                </motion.tr>
              ) : null;

              // An array, not a fragment: AnimatePresence flattens arrays when
              // it collects its children but does not look inside fragments,
              // and the editor row has to be tracked to animate on the way out.
              return [mainRow, transferRow];
            })}
          </AnimatePresence>

          {employees.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-16">
                <div className="flex flex-col items-center gap-3 text-center">
                  <span className="grid size-12 place-items-center rounded-full border border-hairline bg-elevated/60 text-ink-faint">
                    <IconSearch className="size-5" />
                  </span>
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
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
