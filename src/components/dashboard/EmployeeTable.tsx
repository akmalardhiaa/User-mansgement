"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { StatusBadge, employeeStatusLabel } from "@/components/ui/StatusBadge";
import { EMPLOYEE_STATUSES, type Employee, type EmployeeStatus, type JiraIssueRef } from "@/lib/types";

interface EmployeeTableProps {
  employees: Employee[];
  /** The Jira ticket a still-onboarding employee is currently blocked on. */
  activeTickets: Record<string, JiraIssueRef | undefined>;
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

export function EmployeeTable({ employees, activeTickets }: EmployeeTableProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | "ALL">("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
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

  async function toggleAccess(employee: Employee) {
    setBusyId(employee.id);
    setError(null);
    try {
      const response = await fetch(`/api/users/${employee.id}/access`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: employee.status !== "ACTIVE" }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Could not update access.");
      }
      // Re-render the server component so the table reflects the new status.
      startTransition(() => router.refresh());
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
          placeholder="Search name, email, role or department"
          aria-label="Search employees"
          className="w-full rounded-lg border border-hairline-strong bg-canvas/60 px-3 py-2 text-sm placeholder:text-ink-faint focus:border-accent focus:outline-none sm:max-w-sm"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as EmployeeStatus | "ALL")}
          aria-label="Filter by status"
          className="rounded-lg border border-hairline-strong bg-canvas/60 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
        >
          <option value="ALL">All statuses</option>
          {EMPLOYEE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {employeeStatusLabel(status)}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-faint sm:ml-auto">
          {visible.length} of {employees.length}
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
              <th scope="col" className="px-4 py-3 font-medium">Name</th>
              <th scope="col" className="px-4 py-3 font-medium">Role</th>
              <th scope="col" className="px-4 py-3 font-medium">Department</th>
              <th scope="col" className="px-4 py-3 font-medium">Manager</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Access</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((employee) => {
              const ticket = activeTickets[employee.id];
              const busy = busyId === employee.id || pending;

              return (
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
                      <Button
                        variant={employee.status === "ACTIVE" ? "danger" : "secondary"}
                        disabled={busy}
                        onClick={() => toggleAccess(employee)}
                      >
                        {busy ? "Saving…" : employee.status === "ACTIVE" ? "Disable" : "Enable"}
                      </Button>
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
            })}

            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-ink-faint">
                  No employees match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
