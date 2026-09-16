import { AccessDenied } from "@/components/auth/AccessDenied";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditUserView } from "@/components/users/EditUserView";
import { requirePageSession } from "@/lib/auth/current";
import { hasPermission } from "@/lib/auth/roles";
import { listEmployees } from "@/lib/db/repository";
import { loadPendingEmployeeIds } from "@/lib/lifecycle/pendingStore";

export const dynamic = "force-dynamic";

export const metadata = { title: "Edit User · HC User Management" };

export default async function EditUserPage() {
  const session = await requirePageSession("/users/edit");
  if (!hasPermission(session.roles, "employee.update")) {
    return <AccessDenied roles={session.roles} need="Izin mengubah profil karyawan" />;
  }

  const [employees, pendingIds] = await Promise.all([listEmployees(), loadPendingEmployeeIds()]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Manajemen Akun"
        title="Edit User & Profil Karyawan"
        description="Perbarui informasi profil, keterangan jabatan, status karyawan (Permanent/Kontrak), dan lokasi penempatan kerja."
      />

      <EditUserView employees={employees} pendingIds={[...pendingIds]} />
    </div>
  );
}
