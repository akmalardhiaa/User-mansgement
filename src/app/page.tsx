import { redirect } from "next/navigation";

import { Card } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = { ADMIN: "Admin", USER: "Pengguna" };

/**
 * The landing page: the signed-in person's own account, read from the session.
 *
 * Everything shown here comes from Active Directory at login. There is nothing
 * else to manage — the app is only a way to sign in with an AD account and see
 * who you are.
 */
export default async function HomePage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login");

  const rows: Array<[string, string]> = [
    ["Nama", session.name],
    ["Email", session.email],
    ["Peran", ROLE_LABEL[session.role] ?? session.role],
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Active Directory"
        title="Akun saya"
        description="Anda masuk dengan akun Active Directory. Data di bawah diambil dari AD."
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
