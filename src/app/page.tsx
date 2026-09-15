import Link from "next/link";

import { DirectoryView } from "@/components/dashboard/DirectoryView";
import { buttonClasses } from "@/components/ui/Button";
import { IconUserPlus } from "@/components/ui/Icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { listEmployees } from "@/lib/db/repository";

// The roster changes as HC edits it, so never serve a prerendered snapshot.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const employees = await listEmployees();

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
        description="Portal terpadu direktori karyawan dan pengelolaan izin akses, dengan login Active Directory."
        actions={
          <>
            <Link
              href="/users/new"
              className={buttonClasses()}
            >
              <IconUserPlus className="size-4" />
              Tambah karyawan
            </Link>
          </>
        }
      />

      <DirectoryView employees={employees} activeTickets={{}} />
    </div>
  );
}
