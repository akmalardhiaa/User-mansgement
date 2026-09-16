import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/auth/AccessDenied";
import { CancelRequestButton } from "@/components/lifecycle/CancelRequestButton";
import { DecisionPanel } from "@/components/lifecycle/DecisionPanel";
import {
  LifecycleStatusBadge,
  LifecycleTypeBadge,
} from "@/components/lifecycle/LifecycleStatusBadge";
import { EmailDeliveryPanel } from "@/components/lifecycle/EmailDeliveryPanel";
import { ExecutionTimeline } from "@/components/lifecycle/ExecutionTimeline";
import { RequestPayloadSummary } from "@/components/lifecycle/RequestPayloadSummary";
import { RetryButton } from "@/components/lifecycle/RetryButton";
import { RunWorkerButton } from "@/components/lifecycle/RunWorkerButton";
import { Card } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { requirePageSession } from "@/lib/auth/current";
import { hasPermission } from "@/lib/auth/roles";
import { isSamePerson } from "@/lib/lifecycle/routing";
import { LifecycleError, auditTrailFor, getRequest, identityOf } from "@/lib/lifecycle/service";
import { canTransition, stageAwaiting } from "@/lib/lifecycle/stateMachine";
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

const AUDIT_LABEL: Record<string, string> = {
  "request.drafted": "Draf dibuat",
  "request.submitted": "Dikirim ke approver",
  "request.approved": "Disetujui",
  "request.rejected": "Ditolak",
  "request.revised": "Direvisi",
  "request.cancelled": "Dibatalkan",
  "request.queued": "Masuk antrean eksekusi",
  "request.scheduled": "Dijadwalkan",
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
  const { id } = await params;
  const session = await requirePageSession(`/pengajuan/${id}`);

  if (!hasPermission(session.roles, "request.read")) {
    return <AccessDenied roles={session.roles} need="Izin membaca pengajuan" />;
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

  const awaiting = stageAwaiting(request.status);
  const myStep = awaiting
    ? request.approvals.find(
        (step) => step.stage === awaiting && step.version === request.version,
      )
    : undefined;
  const canDecide =
    Boolean(myStep && isSamePerson(myStep.approver, me)) &&
    hasPermission(session.roles, awaiting === "MANAGER" ? "approval.manager" : "approval.ciso");

  const canCancel =
    isSamePerson(request.requester, me) &&
    hasPermission(session.roles, "request.cancel") &&
    canTransition(request.status, "CANCELLED");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/pengajuan"
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <span aria-hidden>←</span>
          Kembali ke daftar pengajuan
        </Link>
        <div className="mt-2">
          <PageHeader
            eyebrow="Pengajuan"
            badge={<LifecycleTypeBadge type={request.type} />}
            title={request.subject.displayName}
            description={`Diajukan ${request.requester.name} pada ${formatDate(request.createdAt)}${
              request.version > 1 ? ` · versi ${request.version}` : ""
            }`}
            actions={<LifecycleStatusBadge status={request.status} />}
          />
        </div>
      </div>

      {["APPROVED", "QUEUED", "SCHEDULED", "FAILED"].includes(request.status) ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info/30 bg-info/10 px-3.5 py-2.5 text-xs leading-relaxed text-info">
          <p className="min-w-0">
            {request.status === "FAILED" ? (
              <>
                Eksekusi berhenti sebelum selesai. Akun berada pada keadaan yang tercatat di bawah —
                periksa dulu sebelum mencoba lagi.
              </>
            ) : request.status === "SCHEDULED" ? (
              <>
                Sah dan menunggu waktu efektif. Belum ada perubahan pada akun.
              </>
            ) : (
              <>
                Kedua approval sudah masuk dan perubahan ini sah. Perubahannya{" "}
                <strong>belum dijalankan</strong> sampai worker menjalankannya, jadi akun masih
                dalam keadaan semula.
              </>
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

      {canDecide && awaiting ? <DecisionPanel request={request} stage={awaiting} /> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-ink">Isi pengajuan</h2>
            <p className="mt-1 text-xs text-ink-muted">
              Dikunci sejak dikirim. Sidik jari:{" "}
              <span className="font-mono">{request.payloadHash.slice(0, 16) || "—"}</span>
            </p>
            <div className="mt-4">
              <RequestPayloadSummary payload={request.payload} />
            </div>
          </Card>

          <ExecutionTimeline jobs={jobs} />

          <Card className="p-6">
            <h2 className="text-sm font-semibold text-ink">Jejak audit</h2>
            <ol className="mt-4 space-y-4 border-l border-hairline-strong pl-5">
              {audit.map((event) => (
                <li key={event.id} className="relative">
                  <span
                    className="absolute top-1.5 -left-[1.4rem] size-2 rounded-full bg-accent"
                    aria-hidden
                  />
                  <p className="text-sm font-medium text-ink">
                    {AUDIT_LABEL[event.action] ?? event.action}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {event.actorName} · {formatDate(event.at)}
                  </p>
                </li>
              ))}
              {audit.length === 0 ? (
                <li className="text-sm text-ink-muted">Belum ada peristiwa tercatat.</li>
              ) : null}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">Persetujuan</h2>
            <ol className="mt-4 space-y-4">
              {request.approvals.map((step) => (
                <li key={`${step.stage}-${step.version}`} className="space-y-1">
                  <p className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
                    {step.stage === "MANAGER" ? "1. Manager" : "2. CISO"}
                  </p>
                  <p className="text-sm font-medium text-ink">{step.approver.name}</p>
                  <p className="font-mono text-[11px] break-all text-ink-muted">
                    {step.approver.email}
                  </p>
                  {step.decision ? (
                    <p
                      className={`text-xs ${step.decision === "APPROVED" ? "text-ok" : "text-danger"}`}
                    >
                      {step.decision === "APPROVED" ? "Disetujui" : "Ditolak"}
                      {step.decidedAt ? ` · ${formatDate(step.decidedAt)}` : ""}
                      {step.reason ? ` — ${step.reason}` : ""}
                    </p>
                  ) : (
                    <p className="text-xs text-ink-faint">Belum memutuskan</p>
                  )}
                </li>
              ))}
              {request.approvals.length === 0 ? (
                <li className="text-sm text-ink-muted">
                  Belum dirutekan — pengajuan masih berupa draf.
                </li>
              ) : null}
            </ol>
          </Card>

          <EmailDeliveryPanel events={mail.events} deliveries={mail.deliveries} />

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">Rincian</h2>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ["Nomor", request.id],
                ["Versi", String(request.version)],
                ["Waktu efektif", request.effectiveAt ? formatDate(request.effectiveAt) : "Segera"],
                ["Kebijakan", request.policyVersion],
                ...(request.closedReason ? [["Alasan penutupan", request.closedReason]] : []),
              ].map(([label, value]) => (
                <div key={label} className="flex gap-3">
                  <dt className="w-28 shrink-0 text-xs text-ink-faint">{label}</dt>
                  <dd className="min-w-0 font-mono text-xs break-all text-ink">{value}</dd>
                </div>
              ))}
            </dl>

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
