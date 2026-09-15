import { redirect } from "next/navigation";

import { UserProfile } from "@/components/accounts/UserProfile";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAccount } from "@/lib/accounts/service";
import { getCurrentUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export const metadata = { title: "Profil · HC User Management" };

/**
 * The signed-in person's own account.
 *
 * The row is read from the database rather than taken from the token: the
 * token is a snapshot up to fifteen minutes old, and a profile page that shows
 * a stale name right after you changed it is worse than one extra query.
 */
export default async function ProfilePage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/profile");

  const user = await getAccount(session.id);

  // A valid token for an account that has since been deleted. Sending them
  // back through login is the only coherent next step.
  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Akun"
        title="Profil saya"
        description="Kelola nama, email, dan kata sandi akun Anda."
      />
      <UserProfile user={user} />
    </div>
  );
}
