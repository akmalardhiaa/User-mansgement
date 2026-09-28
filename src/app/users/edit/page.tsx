import { AccessDenied } from "@/components/auth/AccessDenied";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditUserView } from "@/components/users/EditUserView";
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

export default async function EditUserPage() {
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.editProfile.eyebrow}
        title={t.editProfile.title}
        description={t.editProfile.description}
      />

      <EditUserView employees={employees} pendingIds={[...pendingIds]} />
    </div>
  );
}
