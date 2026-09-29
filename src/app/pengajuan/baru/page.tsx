import Link from "next/link";
import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/auth/AccessDenied";
import { NewRequestView } from "@/components/lifecycle/NewRequestView";
import { PageHeader } from "@/components/ui/PageHeader";
import { requirePageSession } from "@/lib/auth/current";
import { hasPermission } from "@/lib/auth/roles";
import { listEmployees } from "@/lib/db/repository";
import { getTranslations } from "@/lib/i18n/server";

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

  /*
   * Everything about somebody who already has a record is raised from Edit
   * profil now — a profile change, a Movement, a Termination — so any link that
   * still asks this page for one is sent there rather than answered with a form
   * that no longer exists here. `?employeeId=` goes with it, so the person is
   * already selected when they arrive.
   */
  const { type, employeeId } = await searchParams;
  const requested = String(type).toUpperCase();
  if (requested === "PROFILE_UPDATE" || requested === "MOVEMENT" || requested === "TERMINATION") {
    const action = requested === "PROFILE_UPDATE" ? "profile" : requested.toLowerCase();
    redirect(
      `/users/edit?action=${action}${employeeId ? `&employeeId=${encodeURIComponent(employeeId)}` : ""}`,
    );
  }

  const employees = await listEmployees();

  return (
    <div className="space-y-4">
      <PageHeader
        compact
        eyebrow={t.newRequest.eyebrow}
        title={t.newRequest.title}
        description={t.newRequest.description}
        actions={
          <Link
            href="/pengajuan"
            className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
          >
            <span aria-hidden>←</span>
            {t.newRequest.backToList}
          </Link>
        }
      />

      <NewRequestView employees={employees} />
    </div>
  );
}
