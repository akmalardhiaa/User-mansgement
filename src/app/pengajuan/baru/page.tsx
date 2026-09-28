import Link from "next/link";
import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/auth/AccessDenied";
import { NewRequestView } from "@/components/lifecycle/NewRequestView";
import { PageHeader } from "@/components/ui/PageHeader";
import { requirePageSession } from "@/lib/auth/current";
import { hasPermission } from "@/lib/auth/roles";
import { listEmployees } from "@/lib/db/repository";
import { getTranslations } from "@/lib/i18n/server";
import { loadPendingEmployeeIds } from "@/lib/lifecycle/pendingStore";
import { LIFECYCLE_TYPES, type LifecycleType } from "@/lib/lifecycle/types";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getTranslations();
  return { title: t.newRequest.metaTitle };
}

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; employeeId?: string }>;
}) {
  const { t } = await getTranslations();
  const session = await requirePageSession("/pengajuan/baru");
  if (!hasPermission(session.roles, "request.create")) {
    return <AccessDenied roles={session.roles} need={t.newRequest.needCreate} />;
  }

  const { type, employeeId } = await searchParams;
  const requested = String(type).toUpperCase();
  // A profile update is raised from the edit-profile screen, which has the
  // record to diff against; this page has no form for it.
  if (requested === "PROFILE_UPDATE") redirect("/users/edit");
  const initialType = (LIFECYCLE_TYPES as readonly string[]).includes(requested)
    ? (requested as LifecycleType)
    : undefined;

  const [employees, pendingIds] = await Promise.all([listEmployees(), loadPendingEmployeeIds()]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/pengajuan"
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <span aria-hidden>←</span>
          {t.newRequest.backToList}
        </Link>
        <div className="mt-2">
          <PageHeader
            eyebrow={t.newRequest.eyebrow}
            title={t.newRequest.title}
            description={t.newRequest.description}
          />
        </div>
      </div>

      <NewRequestView
        employees={employees}
        // One active request per employee, so anyone already in flight is not
        // offered as a subject.
        selectableEmployees={employees.filter((employee) => !pendingIds.has(employee.id))}
        initialType={initialType}
        initialEmployeeId={employeeId}
      />
    </div>
  );
}
