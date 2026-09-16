import { Card } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { requirePageSession } from "@/lib/auth/current";
import type { PortalRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export const metadata = { title: "Profil · HC User Management" };

const ROLE_LABEL: Record<PortalRole, string> = {
  HC_REQUESTER: "Human Capital",
  MANAGER: "Manager",
  CISO_APPROVER: "CISO / IT Security",
  SYSTEM_ADMIN: "Administrator sistem",
  OPS_OPERATOR: "Operator",
  AUDITOR: "Auditor",
};

/**
 * The signed-in person's own account, read from the session.
 *
 * Name, email and department come from Active Directory at login; roles come
 * from their AD group membership. Changing any of it is done in AD, not here,
 * so this page shows them rather than editing them.
 *
 * The one page every signed-in person can reach, whatever their roles — which
 * is why it also has to be the page that explains having none.
 */
export default async function ProfilePage() {
  const session = await requirePageSession("/profile");

  const rows: Array<[string, string]> = [
    ["Nama", session.fullName],
    ["Username", session.username],
    ["Email", session.email],
    ["Departemen", session.department ?? "—"],
    [
      "Peran portal",
      session.roles.length > 0
        ? session.roles.map((role) => ROLE_LABEL[role] ?? role).join(", ")
        : "Belum ada peran portal",
    ],
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

      {session.roles.length === 0 ? (
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-ink">Belum ada peran portal</h2>
          <p className="mt-2 max-w-prose text-sm text-ink-muted">
            Akun Active Directory Anda dikenali, tetapi belum termasuk group mana pun yang
            dipetakan ke peran portal. Karena itu halaman selain profil ini belum dapat dibuka.
            Hubungi administrator sistem bila Anda seharusnya memiliki akses.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
