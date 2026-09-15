import { redirect } from "next/navigation";

import { Card } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export const metadata = { title: "Profil · HC User Management" };

const ROLE_LABEL: Record<string, string> = { ADMIN: "Admin", USER: "Pengguna" };

/**
 * The signed-in person's own account, read from the session.
 *
 * Name, email and role come from Active Directory at login. Changing them is
 * done in AD, not here, so this page shows them rather than editing them.
 */
export default async function ProfilePage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/profile");

  const rows: Array<[string, string]> = [
    ["Nama", session.name],
    ["Email", session.email],
    ["Peran", ROLE_LABEL[session.role] ?? session.role],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Akun"
        title="Profil saya"
        description="Informasi akun Anda dari Active Directory. Perubahan nama atau kata sandi dilakukan lewat AD."
      />
      <Card className="p-6">
        <dl className="divide-y divide-hairline">
          {rows.map(([label, value]) => (
            <div key={label} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-3">
              <dt className="text-sm text-ink-muted">{label}</dt>
              <dd className="text-sm font-medium break-words text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
