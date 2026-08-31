import { Card } from "@/components/ui/Field";
import { StageBadge, StatusBadge } from "@/components/ui/StatusBadge";
import type { Employee, JiraIssueRef, AccessRequest } from "@/lib/types";

type StepState = "done" | "current" | "todo" | "failed";

interface Step {
  title: string;
  detail: string;
  state: StepState;
  issue?: JiraIssueRef;
}

/** Wording for each step, which differs between adding and removing an account. */
const STEP_COPY = {
  ONBOARDING: {
    submitted: "HC mencatat data karyawan baru.",
    securityTitle: "Penyiapan akses IT Security",
    securityDone: "Akun dan akses sudah disiapkan.",
    securityWaiting: "Menunggu IT Security menutup tiket penyiapan akses.",
    securityPending: "Dibuat otomatis setelah manager menyetujui.",
    finalTitle: "Akun aktif",
    finalDone: "Karyawan sudah aktif di dashboard HC.",
    finalPending: "Diubah otomatis saat tiket penyiapan ditutup.",
  },
  OFFBOARDING: {
    submitted: "HC mengajukan pencabutan akses karyawan ini.",
    securityTitle: "Pencabutan akses IT Security",
    securityDone: "Akun dan akses sudah dicabut.",
    securityWaiting: "Menunggu IT Security menutup tiket pencabutan akses.",
    securityPending: "Dibuat otomatis setelah manager menyetujui.",
    finalTitle: "Akses dicabut",
    finalDone: "Karyawan ditandai Dihapus di dashboard HC.",
    finalPending: "Diubah otomatis saat tiket pencabutan ditutup.",
  },
} as const;

/** Maps a request's stage onto the four visible workflow steps. */
function buildSteps(request: AccessRequest): Step[] {
  const { stage } = request;
  const copy = STEP_COPY[request.type];
  const rejected = stage === "REJECTED";
  const pastManager = stage === "SECURITY_PROVISIONING" || stage === "COMPLETED";

  return [
    {
      title: "Pengajuan dikirim",
      detail: copy.submitted,
      state: "done",
    },
    {
      title: "Persetujuan manager",
      detail: rejected
        ? request.type === "OFFBOARDING"
          ? "Manager menolak penghapusan; akses karyawan tetap berlaku."
          : "Manager menolak pengajuan ini."
        : pastManager
          ? "Disetujui oleh manager."
          : "Menunggu manager memindahkan status tiket di Jira.",
      state: rejected ? "failed" : pastManager ? "done" : "current",
      issue: request.managerIssue,
    },
    {
      title: copy.securityTitle,
      detail:
        stage === "COMPLETED"
          ? copy.securityDone
          : stage === "SECURITY_PROVISIONING"
            ? copy.securityWaiting
            : copy.securityPending,
      state:
        stage === "COMPLETED" ? "done" : stage === "SECURITY_PROVISIONING" ? "current" : "todo",
      issue: request.securityIssue,
    },
    {
      title: copy.finalTitle,
      detail: stage === "COMPLETED" ? copy.finalDone : copy.finalPending,
      state: stage === "COMPLETED" ? "done" : "todo",
    },
  ];
}

const STEP_MARKER: Record<StepState, string> = {
  done: "border-ok/40 bg-ok/15 text-ok",
  current: "border-warn/40 bg-warn/15 text-warn",
  failed: "border-danger/40 bg-danger/15 text-danger",
  todo: "border-hairline-strong bg-elevated text-ink-faint",
};

function StepMarker({ state, index }: { state: StepState; index: number }) {
  const glyph = state === "done" ? "✓" : state === "failed" ? "✕" : String(index + 1);
  return (
    <span
      className={`grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold ${STEP_MARKER[state]}`}
      aria-hidden
    >
      {glyph}
    </span>
  );
}

function IssueLink({ issue }: { issue: JiraIssueRef }) {
  return (
    <a
      href={issue.url}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-xs text-accent-soft hover:underline"
    >
      {issue.key}
      {issue.status ? <span className="text-ink-faint"> · {issue.status}</span> : null} ↗
    </a>
  );
}

interface RequestCardProps {
  request: AccessRequest;
  employee?: Employee;
}

export function RequestCard({ request, employee }: RequestCardProps) {
  const steps = buildSteps(request);

  return (
    <Card className="overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-hairline p-5">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{employee?.name ?? "Karyawan tidak dikenal"}</h2>
          <p className="truncate text-xs text-ink-faint">
            {employee ? `${employee.jobTitle} · ${employee.department}` : request.employeeId}
          </p>
          {request.reason ? (
            <p className="mt-1 truncate text-xs text-ink-muted">Alasan: {request.reason}</p>
          ) : null}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
              request.type === "OFFBOARDING"
                ? "border-danger/30 bg-danger/10 text-danger"
                : "border-accent/30 bg-accent/10 text-accent-soft"
            }`}
          >
            {request.type === "OFFBOARDING" ? "Hapus akun" : "Akun baru"}
          </span>
          <StageBadge stage={request.stage} type={request.type} />
          {employee ? <StatusBadge status={employee.status} /> : null}
        </div>
      </header>

      <div className="grid gap-6 p-5 lg:grid-cols-2">
        <ol className="space-y-4">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <div className="flex flex-col items-center">
                <StepMarker state={step.state} index={index} />
                {index < steps.length - 1 ? (
                  <span className="mt-1 w-px flex-1 bg-hairline-strong" aria-hidden />
                ) : null}
              </div>
              <div className="pb-1">
                <p className="text-sm font-medium text-ink">{step.title}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{step.detail}</p>
                {step.issue ? (
                  <p className="mt-1">
                    <IssueLink issue={step.issue} />
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        <div className="rounded-xl border border-hairline bg-canvas/40 p-4">
          <h3 className="text-xs tracking-wide text-ink-faint uppercase">Aktivitas</h3>
          <ul className="mt-3 space-y-3">
            {[...request.events].reverse().map((event, index) => (
              <li key={`${event.at}-${index}`} className="text-xs">
                <p className="text-ink-muted">{event.message}</p>
                <p className="mt-0.5 text-ink-faint">
                  <time dateTime={event.at}>{new Date(event.at).toLocaleString("id-ID")}</time>
                  {event.actor ? ` · ${event.actor}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
