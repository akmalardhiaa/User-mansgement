import Link from "next/link";

import { AccessDenied } from "@/components/auth/AccessDenied";
import { DirectoryView } from "@/components/dashboard/DirectoryView";
import { buttonClasses } from "@/components/ui/Button";
import { IconUserPlus } from "@/components/ui/Icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { requirePageSession } from "@/lib/auth/current";
import { hasPermission } from "@/lib/auth/roles";
import { listEmployees } from "@/lib/db/repository";
import { loadPendingByEmployee } from "@/lib/lifecycle/pendingStore";

// The roster changes as HC edits it, so never serve a prerendered snapshot.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // The proxy only checks that a cookie exists. This is where a stale or
  // revoked session is actually turned away, and where authority is checked.
  const session = await requirePageSession("/");
  if (!hasPermission(session.roles, "directory.read")) {
    return <AccessDenied roles={session.roles} need="Akses baca direktori karyawan" />;
  }

  // The roster and what is in flight against it, read together so the page
  // cannot render an account state and a request state from different moments.
  const [employees, pending] = await Promise.all([listEmployees(), loadPendingByEmployee()]);
  const canRequest = hasPermission(session.roles, "request.create");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Human Capital Platform"
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-0.5 text-xs font-bold text-shimmer-brand shadow-[0_0_12px_rgba(253,183,19,0.25)]">
            <span className="size-1.5 rounded-full bg-accent" />
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
          /*
           * This pointed at /users/new, which does not exist — the only route
           * under /users is /users/edit — so the primary action on the landing
           * page was a 404.
           *
           * Adding somebody is an Onboarding request now: it carries the
           * manager's and the CISO's approval and is applied by the execution
           * worker. So the button goes where that actually starts, and only
           * appears for somebody allowed to raise one.
           */
          canRequest ? (
            <Link href="/pengajuan/baru?type=ONBOARDING" className={buttonClasses()}>
              <IconUserPlus className="size-4" />
              Tambah karyawan
            </Link>
          ) : null
        }
      />

      <DirectoryView employees={employees} pending={pending} canRequest={canRequest} />
    </div>
  );
}
