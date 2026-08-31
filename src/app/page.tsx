import Link from "next/link";

import { EmployeeTable } from "@/components/dashboard/EmployeeTable";
import { StatsRow } from "@/components/dashboard/StatsRow";
import { SyncButton } from "@/components/dashboard/SyncButton";
import { Card } from "@/components/ui/Field";
import { listEmployees, listRequests } from "@/lib/db/repository";
import type { JiraIssueRef } from "@/lib/types";

// The roster changes on every approval, so never serve a prerendered snapshot.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [employees, requests] = await Promise.all([listEmployees(), listRequests()]);

  // The ticket each still-onboarding employee is currently blocked on.
  const activeTickets: Record<string, JiraIssueRef | undefined> = {};
  for (const request of requests) {
    if (request.stage === "MANAGER_APPROVAL") {
      activeTickets[request.employeeId] = request.managerIssue;
    } else if (request.stage === "SECURITY_PROVISIONING") {
      activeTickets[request.employeeId] = request.securityIssue;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employee directory</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Manage access for existing staff and track new joiners through Jira approvals.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <SyncButton />
          <Link
            href="/users/new"
            className="inline-flex items-center rounded-lg border border-accent/60 bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-soft"
          >
            + Add user
          </Link>
        </div>
      </div>

      <StatsRow employees={employees} />

      <Card className="overflow-hidden">
        <EmployeeTable employees={employees} activeTickets={activeTickets} />
      </Card>
    </div>
  );
}
