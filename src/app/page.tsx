import Link from "next/link";

import { DirectoryView } from "@/components/dashboard/DirectoryView";
import { SyncButton } from "@/components/dashboard/SyncButton";
import { IconUserPlus } from "@/components/ui/Icons";
import { PageHeader } from "@/components/ui/PageHeader";
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
      <PageHeader
        eyebrow="Human Capital"
        title="Direktori karyawan"
        description="Kelola akses karyawan dan pantau pengajuan akun melalui persetujuan di Jira."
        actions={
          <>
            <SyncButton />
            <Link
              href="/users/new"
              className="inline-flex items-center gap-2 rounded-lg border border-accent/70 bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink transition-all duration-200 hover:bg-accent-soft hover:shadow-[0_0_20px_-4px_var(--color-accent)] active:scale-[0.97]"
            >
              <IconUserPlus className="size-4" />
              Tambah akun
            </Link>
          </>
        }
      />

      <DirectoryView employees={employees} activeTickets={activeTickets} />
    </div>
  );
}
