import { PageHeader } from "@/components/ui/PageHeader";
import { EditUserView } from "@/components/users/EditUserView";
import { listEmployees } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export const metadata = { title: "Edit User · HC User Management" };

export default async function EditUserPage() {
  const employees = await listEmployees();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Manajemen Akun"
        title="Edit User & Profil Karyawan"
        description="Perbarui informasi profil, keterangan jabatan, status karyawan (Permanent/Kontrak), dan lokasi penempatan kerja."
      />

      <EditUserView employees={employees} />
    </div>
  );
}
