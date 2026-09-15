"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { EmployeeDetailDrawer } from "@/components/dashboard/EmployeeDetailDrawer";
import { EmployeeReportModal } from "@/components/dashboard/EmployeeReportModal";
import { Button } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import {
  IconArrowUp,
  IconBriefcase,
  IconBuilding,
  IconCheck,
  IconDownload,
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
import { TRANSITION, TRANSITION_FAST, TRANSITION_LAYOUT, collapse } from "@/lib/motion";
import type { Employee, EmployeeStatus, ApprovalReference } from "@/lib/types";

interface EmployeeTableProps {
  /** Already filtered and sorted by the parent. */
  employees: Employee[];
  /** The emailed approval reference a pending employee is currently waiting on. */
  activeTickets: Record<string, ApprovalReference | undefined>;
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
  const [transferring, setTransferring] = useState<string | null>(null);
  const [drawerEmployee, setDrawerEmployee] = useState<Employee | null>(null);
  const [reportEmployee, setReportEmployee] = useState<Employee | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [target, setTarget] = useState({
    department: "",
    jobTitle: "",
    managerName: "",
    managerEmail: "",
    reason: "",
  });

  const allSelected = employees.length > 0 && selectedIds.size === employees.length;

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(employees.map((e) => e.id)));
    }
  }

  // React.SyntheticEvent, not MouseEvent: this is wired to a checkbox
  // onChange, which hands over a ChangeEvent. stopPropagation exists on both.
  function toggleSelectOne(id: string, event: React.SyntheticEvent) {
    event.stopPropagation();
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkToggleAccess() {
    if (selectedIds.size === 0) return;
    toast(`Status ${selectedIds.size} akun berhasil diperbarui!`, "success");
    setSelectedIds(new Set());
  }

  function handleBulkExport() {
    if (selectedIds.size === 0) return;
    toast(`${selectedIds.size} karyawan terpilih diekspor ke format Excel.`, "info");
    setSelectedIds(new Set());
  }

  function openTransfer(employee: Employee) {
    if (transferring === employee.id) {
      setTransferring(null);
      return;
    }
    setTransferring(employee.id);
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
          result.managerIssue ? ` · referensi ${result.managerIssue.key}` : ""
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
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="relative overflow-x-auto">
      {/* Floating Bulk Action Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="sticky bottom-4 z-20 mx-auto flex w-full max-w-xl items-center justify-between gap-4 rounded-2xl border border-accent/40 bg-surface/95 p-3.5 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 place-items-center rounded-lg bg-accent text-xs font-bold text-accent-ink">
                {selectedIds.size}
              </span>
              <span className="text-xs font-semibold text-ink">Karyawan Terpilih</span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" icon={<IconDownload />} onClick={handleBulkExport}>
                Ekspor Terpilih
              </Button>
              <Button size="sm" variant="danger" icon={<IconPower />} onClick={handleBulkToggleAccess}>
                Toggle Akses
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                Batal
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <EmployeeDetailDrawer
        employee={drawerEmployee}
        activeTicket={drawerEmployee ? activeTickets[drawerEmployee.id] : undefined}
        onClose={() => setDrawerEmployee(null)}
        onToggleAccess={toggleAccess}
        onOpenTransfer={openTransfer}
        onOpenReportPDF={(emp) => setReportEmployee(emp)}
        busy={busyId === drawerEmployee?.id}
      />

      <EmployeeReportModal
        employee={reportEmployee}
        activeTicket={reportEmployee ? activeTickets[reportEmployee.id] : undefined}
        onClose={() => setReportEmployee(null)}
      />

      <table className="w-full min-w-[58rem] text-left text-sm">
        <thead>
          <tr className="border-b border-hairline text-xs tracking-wide text-ink-faint uppercase">
            <th scope="col" className="px-3 py-3 w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="size-4 rounded border-hairline bg-canvas accent-accent cursor-pointer"
                title="Pilih semua"
              />
            </th>
            {COLUMNS.map((column) => {
              const isSorted = sort === column.key;
              return (
                <th
                  key={column.key}
                  scope="col"
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
            {employees.map((employee, index) => {
              const ticket = activeTickets[employee.id];
              const busy = busyId === employee.id;
              const open = transferring === employee.id;
              const isSelected = selectedIds.has(employee.id);
              const mainRow = (
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
                  className={`group border-b border-hairline/60 transition-[background-color,box-shadow] duration-200 ease-(--ease-out-quint) last:border-0 cursor-pointer ${
                    isSelected ? "bg-accent/10" : ""
                  } ${
                    open
                      ? "bg-elevated/40 shadow-[inset_2px_0_0_0_var(--color-info)]"
                      : "hover:bg-elevated/50 hover:shadow-[inset_2px_0_0_0_var(--color-accent)]"
                  }`}
                >
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => toggleSelectOne(employee.id, e)}
                      className="size-4 rounded border-hairline bg-canvas accent-accent cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-hairline-strong bg-elevated text-xs font-semibold text-ink-muted transition-[color,border-color,scale] duration-200 ease-(--ease-out-quint) group-hover:scale-105 group-hover:border-accent/50 group-hover:text-accent">
                        {initials(employee.displayName)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink group-hover:text-accent transition-colors">
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
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-2 whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDrawerEmployee(employee)}
                        title="Lihat profil detail karyawan"
                      >
                        Detail
                      </Button>
                      {canToggleAccess(employee.status) ? (
                        <>
                          <Button
                            variant={employee.status === "ACTIVE" ? "danger" : "success"}
                            size="sm"
                            loading={busy}
                            icon={<IconPower />}
                            onClick={() => toggleAccess(employee)}
                            title={
                              employee.status === "ACTIVE"
                                ? "Nonaktifkan akses seketika, tanpa persetujuan"
                                : "Aktifkan kembali akses seketika, tanpa persetujuan"
                            }
                          >
                            {employee.status === "ACTIVE" ? "Nonaktifkan" : "Aktifkan"}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            icon={<IconSwap />}
                            aria-expanded={open}
                            onClick={() => openTransfer(employee)}
                            title="Kirim email persetujuan untuk memindahkan divisi"
                          >
                            Ubah posisi
                          </Button>
                        </>
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
                      ) : null}
                    </div>
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
                  <td colSpan={7} className="p-0">
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
            <motion.tr
              // Reached by narrowing a filter, so it should arrive the way the
              // rows it replaced did rather than blinking into place.
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={TRANSITION}
            >
              <td colSpan={7} className="px-4 py-16">
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
