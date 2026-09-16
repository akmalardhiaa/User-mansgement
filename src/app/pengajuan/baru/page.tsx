import Link from "next/link";

import { AccessDenied } from "@/components/auth/AccessDenied";
import { NewRequestView } from "@/components/lifecycle/NewRequestView";
import { PageHeader } from "@/components/ui/PageHeader";
import { requirePageSession } from "@/lib/auth/current";
import { hasPermission } from "@/lib/auth/roles";
import { listEmployees } from "@/lib/db/repository";
import { loadPendingEmployeeIds } from "@/lib/lifecycle/pendingStore";
import { LIFECYCLE_TYPES, type LifecycleType } from "@/lib/lifecycle/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Pengajuan baru · HC User Management" };

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; employeeId?: string }>;
}) {
  const session = await requirePageSession("/pengajuan/baru");
  if (!hasPermission(session.roles, "request.create")) {
    return <AccessDenied roles={session.roles} need="Izin membuat pengajuan" />;
  }

  const { type, employeeId } = await searchParams;
  const initialType = (LIFECYCLE_TYPES as readonly string[]).includes(String(type).toUpperCase())
    ? (String(type).toUpperCase() as LifecycleType)
    : undefined;

  const [employees, pendingIds] = await Promise.all([listEmployees(), loadPendingEmployeeIds()]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/pengajuan"
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <span aria-hidden>←</span>
          Kembali ke daftar pengajuan
        </Link>
        <div className="mt-2">
          <PageHeader
            eyebrow="Pengajuan"
            title="Pengajuan baru"
            description="Setiap pengajuan melewati persetujuan manager lalu CISO. Tidak ada perubahan pada akun sampai keduanya menyetujui dan perubahannya dijalankan."
          />
        </div>
      </div>

      <NewRequestView
        employees={employees}
        // One active request per employee, so anyone already in flight is not
        // offered as a subject.
        selectableEmployees={employees.filter((employee) => !pendingIds.has(employee.id))}
        initialType={initialType}
        initialEmployeeId={employeeId}
      />
    </div>
  );
}
