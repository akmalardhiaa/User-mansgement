import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/auth/AccessDenied";
import { CancelRequestButton } from "@/components/lifecycle/CancelRequestButton";
import {
  LifecycleStatusBadge,
  LifecycleTypeBadge,
} from "@/components/lifecycle/LifecycleStatusBadge";
import { EmailDeliveryPanel } from "@/components/lifecycle/EmailDeliveryPanel";
import { ExecutionTimeline } from "@/components/lifecycle/ExecutionTimeline";
import { RequestPayloadSummary } from "@/components/lifecycle/RequestPayloadSummary";
import { RetryButton } from "@/components/lifecycle/RetryButton";
import { RunWorkerButton } from "@/components/lifecycle/RunWorkerButton";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { requirePageSession } from "@/lib/auth/current";
import { hasPermission } from "@/lib/auth/roles";
import type { Dictionary } from "@/lib/i18n/dictionaries/id";
import { getTranslations } from "@/lib/i18n/server";
import { isSamePerson } from "@/lib/lifecycle/routing";
import { LifecycleError, auditTrailFor, getRequest, identityOf } from "@/lib/lifecycle/service";
import { canTransition } from "@/lib/lifecycle/stateMachine";
import { deliveriesForRequest } from "@/lib/lifecycle/dispatcher";
import { jobsForRequest } from "@/lib/lifecycle/worker";

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}

/** Audit actions to dictionary keys — the words live with the page's words. */
const AUDIT_LABEL: Record<string, keyof Dictionary["detail"]> = {
  "request.drafted": "auditDrafted",
  "request.submitted": "auditSubmitted",
  "request.approved": "auditApproved",
  "request.rejected": "auditRejected",
  "request.revised": "auditRevised",
  "request.cancelled": "auditCancelled",
  "request.queued": "auditQueued",
  "request.scheduled": "auditScheduled",
};

/**
 * One request, in full.
 *
 * Everything on this page comes from stored records — the locked payload, the
 * two approval steps with whoever actually answered them, and an audit trail
 * built from events that were written in the same transaction as the changes
 * they describe. Nothing is reconstructed for display, which is the difference
 * between a timeline and an illustration of one.
 */
export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { t } = await getTranslations();
  const { id } = await params;
  const session = await requirePageSession(`/pengajuan/${id}`);

  if (!hasPermission(session.roles, "request.read")) {
    return <AccessDenied roles={session.roles} need={t.requests.needRead} />;
  }

  let request;
  try {
    request = await getRequest(id, session);
  } catch (error) {
    // The service reports an out-of-scope request as missing rather than
    // forbidden, and so does this page: confirming it exists would already leak
    // that somebody is being onboarded, moved, or terminated.
    if (error instanceof LifecycleError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const [audit, jobs, mail] = await Promise.all([
    auditTrailFor(request.id),
    jobsForRequest(request.id),
    deliveriesForRequest(request.id),
  ]);
  const me = identityOf(session);
  const canRun = hasPermission(session.roles, "execution.run");

  // Nobody decides from here. Both approvals come from the email, and this page
  // only shows who was asked and who answered.

  const canCancel =
    isSamePerson(request.requester, me) &&
    hasPermission(session.roles, "request.cancel") &&
    canTransition(request.status, "CANCELLED");

  // Offered, not granted: the revise endpoint re-checks all three.
  const canRevise =
    isSamePerson(request.requester, me) &&
    hasPermission(session.roles, "request.create") &&
    (request.status === "DRAFT" || canTransition(request.status, "DRAFT"));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/pengajuan"
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <span aria-hidden>←</span>
          {t.detail.back}
        </Link>
        <div className="mt-2">
          <PageHeader
            eyebrow={t.detail.eyebrow}
            badge={<LifecycleTypeBadge type={request.type} />}
            title={request.subject.displayName}
            description={`${t.detail.raised
              .replace("{name}", request.requester.name)
              .replace("{date}", formatDate(request.createdAt))}${
              request.version > 1
                ? ` · ${t.detail.version.replace("{version}", String(request.version))}`
                : ""
            }`}
            actions={<LifecycleStatusBadge status={request.status} />}
          />
        </div>
      </div>

      {["APPROVED", "QUEUED", "SCHEDULED", "FAILED"].includes(request.status) ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info/30 bg-info/10 px-3.5 py-2.5 text-xs leading-relaxed text-info">
          <p className="min-w-0">
            {request.status === "FAILED" ? (
              t.detail.failedNotice
            ) : request.status === "SCHEDULED" ? (
              t.detail.scheduledNotice
            ) : (
              t.detail.approvedNotice
            )}
          </p>
          {canRun ? (
            request.status === "FAILED" ? (
              <RetryButton requestId={request.id} />
            ) : (
              <RunWorkerButton />
            )
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-ink">{t.detail.payloadTitle}</h2>
            <p className="mt-1 text-xs text-ink-muted">
              {t.detail.payloadLocked.split("{hash}")[0]}
              <span className="font-mono">{request.payloadHash.slice(0, 16) || "—"}</span>
            </p>
            <div className="mt-4">
              <RequestPayloadSummary payload={request.payload} />
            </div>
          </Card>

          <ExecutionTimeline jobs={jobs} />

          <Card className="p-6">
            <h2 className="text-sm font-semibold text-ink">{t.detail.auditTitle}</h2>
            <ol className="mt-4 space-y-4 border-l border-hairline-strong pl-5">
              {audit.map((event) => (
                <li key={event.id} className="relative">
                  <span
                    className="absolute top-1.5 -left-[1.4rem] size-2 rounded-full bg-accent"
                    aria-hidden
                  />
                  <p className="text-sm font-medium text-ink">
                    {AUDIT_LABEL[event.action] ? t.detail[AUDIT_LABEL[event.action]] : event.action}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {event.actorName} · {formatDate(event.at)}
                  </p>
                </li>
              ))}
              {audit.length === 0 ? (
                <li className="text-sm text-ink-muted">{t.detail.auditEmpty}</li>
              ) : null}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">{t.detail.approvalsTitle}</h2>
            <ol className="mt-4 space-y-4">
              {request.approvals.map((step) => (
                <li key={`${step.stage}-${step.version}`} className="space-y-1">
                  <p className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
                    {step.stage === "MANAGER" ? t.detail.stageManager : t.detail.stageCiso}
                  </p>
                  <p className="text-sm font-medium text-ink">{step.approver.name}</p>
                  {step.pool?.length ? (
                    <ul className="space-y-0.5">
                      {step.pool.map((member) => (
                        <li key={member.email} className="font-mono text-[11px] break-all text-ink-muted">
                          {member.name !== member.email ? `${member.name} · ` : ""}
                          {member.email}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="font-mono text-[11px] break-all text-ink-muted">
                      {step.approver.email}
                    </p>
                  )}
                  {step.decision ? (
                    <p
                      className={`text-xs ${step.decision === "APPROVED" ? "text-ok" : "text-danger"}`}
                    >
                      {step.decision === "APPROVED" ? t.detail.approved : t.detail.rejected}
                      {step.pool?.length && step.decidedBy
                        ? t.detail.decidedBy.replace("{name}", step.decidedBy.name)
                        : ""}
                      {step.decidedAt ? ` · ${formatDate(step.decidedAt)}` : ""}
                      {step.reason ? ` — ${step.reason}` : ""}
                    </p>
                  ) : (
                    <p className="text-xs text-ink-faint">
                      {step.pool?.length
                        ? t.detail.waitingTeam
                        : t.detail.waiting}
                    </p>
                  )}
                </li>
              ))}
              {request.approvals.length === 0 ? (
                <li className="text-sm text-ink-muted">
                  {t.detail.notRoutedYet}
                </li>
              ) : null}
            </ol>
          </Card>

          <EmailDeliveryPanel
            events={mail.events}
            deliveries={mail.deliveries}
            canDispatch={canRun}
          />

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">{t.detail.detailsTitle}</h2>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                [t.detail.number, request.id],
                [t.detail.versionLabel, String(request.version)],
                [
                  t.detail.effectiveAt,
                  request.effectiveAt ? formatDate(request.effectiveAt) : t.detail.immediately,
                ],
                [t.detail.policy, request.policyVersion],
                ...(request.closedReason ? [[t.detail.closedReason, request.closedReason]] : []),
              ].map(([label, value]) => (
                <div key={label} className="flex gap-3">
                  <dt className="w-28 shrink-0 text-xs text-ink-faint">{label}</dt>
                  <dd className="min-w-0 font-mono text-xs break-all text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            {canRevise ? (
              <div className="mt-4 space-y-2 border-t border-hairline pt-4">
                <Link
                  href={`/pengajuan/${request.id}/revisi`}
                  className={buttonClasses("secondary")}
                >
                  {t.detail.revise}
                </Link>
                <p className="text-xs text-ink-faint">
                  {t.detail.reviseHint}
                </p>
              </div>
            ) : null}

            {canCancel ? (
              <div className="mt-4 border-t border-hairline pt-4">
                <CancelRequestButton request={request} />
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
