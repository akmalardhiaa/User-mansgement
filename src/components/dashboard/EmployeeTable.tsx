"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { StatusBadge, employeeStatusLabel } from "@/components/ui/StatusBadge";
import { apiDataSource, type DashboardDataSource } from "@/lib/client/dataSource";
import { EMPLOYEE_STATUSES, type Employee, type EmployeeStatus, type JiraIssueRef } from "@/lib/types";

interface EmployeeTableProps {
  employees: Employee[];
  /** The Jira ticket a still-onboarding employee is currently blocked on. */
  activeTickets: Record<string, JiraIssueRef | undefined>;
  /** Swapped for an in-browser mock by the static demo. */
  dataSource?: DashboardDataSource;
  /** Called after a successful change; defaults to refreshing the server components. */
  onChanged?: () => void;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Access can only be toggled once an account exists; in-flight requests cannot. */
function canToggleAccess(status: EmployeeStatus): boolean {
  return status === "ACTIVE" || status === "DISABLED";
}

export function EmployeeTable({
  employees,
  activeTickets,
  dataSource = apiDataSource,
  onChanged,
}: EmployeeTableProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | "ALL">("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Removal is confirmed inline rather than through window.confirm/prompt, which
  // sandboxed embeds block outright.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return employees.filter((employee) => {
      if (statusFilter !== "ALL" && employee.status !== statusFilter) return false;
      if (!needle) return true;
      return [employee.name, employee.email, employee.jobTitle, employee.department]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [employees, query, statusFilter]);

  async function requestRemoval(employee: Employee) {
    setBusyId(employee.id);
    setError(null);
    try {
      await dataSource.requestRemoval(employee.id, reason.trim() || undefined);
      setConfirming(null);
      setReason("");
      if (onChanged) {
        onChanged();
      } else {
        startTransition(() => router.refresh());
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleAccess(employee: Employee) {
    setBusyId(employee.id);
    setError(null);
    try {
      await dataSource.toggleAccess(employee.id, employee.status !== "ACTIVE");
      if (onChanged) {
        onChanged();
      } else {
        // Re-render the server component so the table reflects the new status.
        startTransition(() => router.refresh());
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-hairline p-4 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari nama, email, jabatan, atau departemen"
          aria-label="Cari karyawan"
          className="w-full rounded-lg border border-hairline-strong bg-canvas/60 px-3 py-2 text-sm placeholder:text-ink-faint focus:border-accent focus:outline-none sm:max-w-sm"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as EmployeeStatus | "ALL")}
          aria-label="Saring berdasarkan status"
          className="rounded-lg border border-hairline-strong bg-canvas/60 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
        >
          <option value="ALL">Semua status</option>
          {EMPLOYEE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {employeeStatusLabel(status)}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-faint sm:ml-auto">
          {visible.length} dari {employees.length}
        </span>
      </div>

      {error ? (
        <p role="alert" className="border-b border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs tracking-wide text-ink-faint uppercase">
              <th scope="col" className="px-4 py-3 font-medium">Nama</th>
              <th scope="col" className="px-4 py-3 font-medium">Jabatan</th>
              <th scope="col" className="px-4 py-3 font-medium">Departemen</th>
              <th scope="col" className="px-4 py-3 font-medium">Manager</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Akses</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((employee) => {
              const ticket = activeTickets[employee.id];
              const busy = busyId === employee.id || pending;

              const mainRow = (
                <tr
                  key={employee.id}
                  className="border-b border-hairline/60 transition-colors last:border-0 hover:bg-elevated/50"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-hairline-strong bg-elevated text-xs font-semibold text-ink-muted">
                        {initials(employee.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{employee.name}</span>
                        <span className="block truncate text-xs text-ink-faint">{employee.email}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{employee.jobTitle}</td>
                  <td className="px-4 py-3 text-ink-muted">{employee.department}</td>
                  <td className="px-4 py-3 text-ink-muted">{employee.managerName}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={employee.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canToggleAccess(employee.status) ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() => toggleAccess(employee)}
                          title="Nonaktifkan akses seketika, tanpa persetujuan"
                        >
                          {busy ? "Menyimpan…" : employee.status === "ACTIVE" ? "Nonaktifkan" : "Aktifkan"}
                        </Button>
                        <Button
                          variant="danger"
                          disabled={busy}
                          onClick={() => {
                            setConfirming(employee.id);
                            setReason("");
                          }}
                          title="Buat tiket persetujuan di Jira untuk mencabut akun ini"
                        >
                          Hapus
                        </Button>
                      </div>
                    ) : ticket ? (
                      <a
                        href={ticket.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-accent-soft hover:underline"
                      >
                        {ticket.key} ↗
                      </a>
                    ) : (
                      <span className="text-xs text-ink-faint">—</span>
                    )}
                  </td>
                </tr>
              );

              const confirmRow =
                confirming === employee.id ? (
                  <tr key={`${employee.id}-confirm`} className="bg-danger/5">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm text-ink">
                          Ajukan penghapusan akun <strong>{employee.name}</strong>? Ini membuat tiket
                          persetujuan di Jira untuk {employee.managerName} — akses baru dicabut
                          setelah IT Security mengerjakannya.
                        </span>
                        <input
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          placeholder="Alasan (opsional)"
                          aria-label={`Alasan penghapusan akun ${employee.name}`}
                          className="min-w-48 flex-1 rounded-lg border border-hairline-strong bg-canvas/60 px-3 py-2 text-sm placeholder:text-ink-faint focus:border-accent focus:outline-none"
                        />
                        <Button
                          variant="danger"
                          disabled={busy}
                          onClick={() => requestRemoval(employee)}
                        >
                          {busy ? "Mengirim…" : "Konfirmasi penghapusan"}
                        </Button>
                        <Button variant="ghost" disabled={busy} onClick={() => setConfirming(null)}>
                          Batal
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : null;

              return [mainRow, confirmRow];
            })}

            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-ink-faint">
                  Tidak ada karyawan yang cocok dengan filter ini.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
