import { Card } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { requirePageSession } from "@/lib/auth/current";
import { getTranslations } from "@/lib/i18n/server";
import type { PortalRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getTranslations();
  return { title: t.profile.metaTitle };
}

const ROLE_LABEL: Record<PortalRole, string> = {
  HC_REQUESTER: "Human Capital",
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
  const { t } = await getTranslations();
  const session = await requirePageSession("/profile");

  const rows: Array<[string, string]> = [
    [t.profile.name, session.fullName],
    [t.profile.username, session.username],
    [t.profile.email, session.email],
    [t.profile.department, session.department ?? "—"],
    [
      t.profile.portalRoles,
      session.roles.length > 0
        ? session.roles.map((role) => ROLE_LABEL[role] ?? role).join(", ")
        : t.profile.noRole,
    ],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.profile.eyebrow}
        title={t.profile.title}
        description={t.profile.description}
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
          <h2 className="text-sm font-semibold text-ink">{t.profile.noRole}</h2>
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
