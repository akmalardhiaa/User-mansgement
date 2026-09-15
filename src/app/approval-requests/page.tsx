import Link from "next/link";
import { redirect } from "next/navigation";

import { ApprovalDashboard } from "@/components/approval/ApprovalDashboard";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Field";
import { IconAlert, IconUserPlus } from "@/components/ui/Icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export const metadata = { title: "Approval user · HC User Management" };

/** Admin only, checked here for the page and again in GET /api/approvals for the data. */
export default async function ApprovalRequestsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/approval-requests");

  if (user.role !== "ADMIN") {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Approval" title="Approval user" />
        <Card className="p-6 text-sm">
          <p className="flex items-center gap-2 font-medium text-warn">
            <IconAlert className="size-4" />
            Halaman ini hanya untuk admin.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Approval"
        title="Approval user"
        description="Semua pengajuan akun beserta posisinya di alur HC → Manager → CISO → Aktif. Klik baris untuk melihat jejak audit."
        actions={
          <Link href="/register" className={buttonClasses()}>
            <IconUserPlus className="size-4" />
            Buat user
          </Link>
        }
      />
      <ApprovalDashboard />
    </div>
  );
}
