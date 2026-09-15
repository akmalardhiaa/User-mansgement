import Link from "next/link";

import { DirectoryView } from "@/components/dashboard/DirectoryView";
import { buttonClasses } from "@/components/ui/Button";
import { IconUserPlus } from "@/components/ui/Icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { listEmployees, listRequests } from "@/lib/db/repository";
import type { ApprovalReference } from "@/lib/types";

// The roster changes on every approval, so never serve a prerendered snapshot.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [employees, requests] = await Promise.all([listEmployees(), listRequests()]);

  // The ticket each still-onboarding employee is currently blocked on.
  const activeTickets: Record<string, ApprovalReference | undefined> = {};
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
        eyebrow="Human Capital Platform"
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-0.5 text-xs font-bold text-shimmer-brand shadow-[0_0_12px_rgba(253,183,19,0.25)]">
            <span className="size-1.5 rounded-full bg-accent animate-pulse" />
            User Management
          </span>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span>Direktori Karyawan</span>
            <span className="text-shimmer-brand text-2xl sm:text-3xl font-extrabold">
              & User Management
            </span>
          </span>
        }
        description="Portal terpadu pengawasan direktori karyawan, pengelolaan izin akses, dan persetujuan melalui email."
        actions={
          <>
            <Link
              href="/users/new"
              className={buttonClasses()}
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
