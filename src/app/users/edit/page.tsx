import { AccessDenied } from "@/components/auth/AccessDenied";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditUserView, type EditAction } from "@/components/users/EditUserView";
import { requirePageSession } from "@/lib/auth/current";
import { getTranslations } from "@/lib/i18n/server";
import { hasPermission } from "@/lib/auth/roles";
import { listEmployees } from "@/lib/db/repository";
import { loadPendingEmployeeIds } from "@/lib/lifecycle/pendingStore";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getTranslations();
  return { title: t.editProfile.metaTitle };
}

/** The action names the URL may ask for, matching EditUserView's own. */
const ACTIONS: readonly EditAction[] = ["profile", "movement", "termination"];

export default async function EditUserPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; employeeId?: string }>;
}) {
  const { t } = await getTranslations();
  const session = await requirePageSession("/users/edit");
  // Saving raises a request, so both are needed. The API enforces
  // `request.create` on its own; this only avoids offering a form whose submit
  // would be refused.
  if (
    !hasPermission(session.roles, "employee.update") ||
    !hasPermission(session.roles, "request.create")
  ) {
    return <AccessDenied roles={session.roles} need={t.editProfile.need} />;
  }

  const [employees, pendingIds] = await Promise.all([listEmployees(), loadPendingEmployeeIds()]);

  /*
   * Which action to open on, and about whom. Both arrive in the URL — from the
   * directory's "raise a request" button, and from the old /pengajuan/baru
   * links that now redirect here. Matched against the closed list rather than
   * trusted: an unknown action opens the profile form, which is the harmless
   * one, and an unknown employee id simply selects nobody.
   */
  const { action, employeeId } = await searchParams;
  const initialAction = ACTIONS.find((candidate) => candidate === action);

  return (
    <div className="space-y-3">
      <PageHeader
        compact
        eyebrow={t.editProfile.eyebrow}
        title={t.editProfile.title}
        description={t.editProfile.description}
      />

      <EditUserView
        employees={employees}
        pendingIds={[...pendingIds]}
        initialAction={initialAction}
        initialEmployeeId={employeeId}
      />
    </div>
  );
}
