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
  // Saving raises a request, so both are needed. The API enforces
  // `request.create` on its own; this only avoids offering a form whose submit
  // would be refused.
  if (
    !hasPermission(session.roles, "employee.update") ||
    !hasPermission(session.roles, "request.create")
  ) {
    return <AccessDenied roles={session.roles} need="Izin mengajukan perubahan profil karyawan" />;
  }

  const [employees, pendingIds] = await Promise.all([listEmployees(), loadPendingEmployeeIds()]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Manajemen Akun"
        title="Edit User & Profil Karyawan"
        description="Ajukan perubahan profil, keterangan jabatan, status karyawan (Permanent/Kontrak), dan lokasi penempatan kerja. Perubahan dikirim ke manager lalu CISO lewat email, dan baru berlaku setelah keduanya menyetujui."
      />

      <EditUserView employees={employees} pendingIds={[...pendingIds]} />
    </div>
  );
}
