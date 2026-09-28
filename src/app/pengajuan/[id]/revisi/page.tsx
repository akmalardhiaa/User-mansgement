import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/auth/AccessDenied";
import { LifecycleTypeBadge } from "@/components/lifecycle/LifecycleStatusBadge";
import { ReviseRequestView } from "@/components/lifecycle/ReviseRequestView";
import { FormAlert } from "@/components/ui/FormAlert";
import { PageHeader } from "@/components/ui/PageHeader";
import { requirePageSession } from "@/lib/auth/current";
import { getTranslations } from "@/lib/i18n/server";
import { hasPermission } from "@/lib/auth/roles";
import { listEmployees } from "@/lib/db/repository";
import { isSamePerson } from "@/lib/lifecycle/routing";
import { LifecycleError, getRequest, identityOf } from "@/lib/lifecycle/service";
import { canTransition } from "@/lib/lifecycle/stateMachine";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getTranslations();
  return { title: t.actions.reviseMetaTitle };
}

/**
 * The revision screen.
 *
 * Every check here is repeated by the server when the revision is sent — who
 * may revise, from which status, into what — because this page is only what is
 * offered, not what is allowed. It exists so that somebody who cannot revise is
 * told why instead of being shown a form that will be refused.
 */
export default async function ReviseRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { t } = await getTranslations();
  const { id } = await params;
  const session = await requirePageSession(`/pengajuan/${id}/revisi`);

  if (!hasPermission(session.roles, "request.create")) {
    return <AccessDenied roles={session.roles} need={t.actions.reviseNeed} />;
  }

  let request;
  try {
    request = await getRequest(id, session);
  } catch (error) {
    if (error instanceof LifecycleError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const back = (
    <Link
      href={`/pengajuan/${request.id}`}
      className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
    >
      <span aria-hidden>←</span>
      Kembali ke pengajuan
    </Link>
  );

  const isRequester = isSamePerson(request.requester, identityOf(session));
  const revisable = request.status === "DRAFT" || canTransition(request.status, "DRAFT");

  if (!isRequester || !revisable) {
    return (
      <div className="space-y-4">
        {back}
        <FormAlert tone="error">
          {!isRequester
            ? t.actions.reviseRequesterOnly
            : `Pengajuan berstatus ${request.status} tidak dapat direvisi lagi. Revisi hanya bisa selama pengajuan masih menunggu persetujuan.`}
        </FormAlert>
      </div>
    );
  }

  const employees = await listEmployees();
  const subject = request.employeeId
    ? employees.find((employee) => employee.id === request.employeeId)
    : undefined;

  return (
    <div className="space-y-6">
      <div>
        {back}
        <div className="mt-2">
          <PageHeader
            eyebrow={t.actions.reviseEyebrow}
            badge={<LifecycleTypeBadge type={request.type} />}
            title={request.subject.displayName}
            description={t.actions.reviseDescription
              .replace("{from}", String(request.version))
              .replace(
                "{to}",
                String(request.status === "DRAFT" ? request.version : request.version + 1),
              )}
          />
        </div>
      </div>

      <ReviseRequestView request={request} employees={employees} subject={subject} />
    </div>
  );
}
