import type { ApprovalStatus } from "@prisma/client";

import { IconAlert, IconCheck, IconClock } from "@/components/ui/Icons";

/**
 * The four steps of an account approval, and where a request stands in them.
 *
 * Status is shown in form as well as in words — a filled check, an outlined
 * clock, a red mark — so a row of these can be scanned without reading.
 */

export const STATUS_META: Record<ApprovalStatus, { label: string; tone: string }> = {
  PENDING: { label: "Menunggu manager", tone: "border-warn/30 bg-warn/10 text-warn" },
  MANAGER_APPROVED: { label: "Menunggu IT Security", tone: "border-info/30 bg-info/10 text-info" },
  MANAGER_REJECTED: { label: "Ditolak manager", tone: "border-danger/30 bg-danger/10 text-danger" },
  IT_APPROVED: { label: "Disetujui IT Security", tone: "border-info/30 bg-info/10 text-info" },
  IT_REJECTED: { label: "Ditolak IT Security", tone: "border-danger/30 bg-danger/10 text-danger" },
  ACTIVE: { label: "Aktif", tone: "border-ok/30 bg-ok/10 text-ok" },
};

export function StatusPill({ status }: { status: ApprovalStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${meta.tone}`}
    >
      {meta.label}
    </span>
  );
}

type StepState = "done" | "current" | "waiting" | "rejected" | "skipped";

interface Step {
  title: string;
  state: StepState;
  at?: string | null;
}

export interface ProgressInput {
  status: ApprovalStatus;
  createdAt: string;
  managerApprovedAt?: string | null;
  cisoApprovedAt?: string | null;
  activatedAt?: string | null;
  rejectedAt?: string | null;
}

export function buildSteps(input: ProgressInput): Step[] {
  const { status } = input;
  const rejected = status === "MANAGER_REJECTED" || status === "IT_REJECTED";

  return [
    { title: "HC Mengajukan", state: "done", at: input.createdAt },
    {
      title: "Manager Setuju",
      state: input.managerApprovedAt
        ? "done"
        : status === "MANAGER_REJECTED"
          ? "rejected"
          : status === "PENDING"
            ? "current"
            : "waiting",
      at: input.managerApprovedAt ?? (status === "MANAGER_REJECTED" ? input.rejectedAt : null),
    },
    {
      title: "IT Security Setuju",
      state: input.cisoApprovedAt
        ? "done"
        : status === "IT_REJECTED"
          ? "rejected"
          : status === "MANAGER_APPROVED"
            ? "current"
            : rejected
              ? "skipped"
              : "waiting",
      at: input.cisoApprovedAt ?? (status === "IT_REJECTED" ? input.rejectedAt : null),
    },
    {
      title: "Akun Aktif",
      state: status === "ACTIVE" ? "done" : status === "IT_APPROVED" ? "current" : rejected ? "skipped" : "waiting",
      at: input.activatedAt,
    },
  ];
}

const CAPTION: Record<StepState, string> = {
  done: "Selesai",
  current: "Menunggu",
  waiting: "Belum",
  rejected: "Ditolak",
  skipped: "Dibatalkan",
};

function Marker({ state, index }: { state: StepState; index: number }) {
  const base = "grid size-8 shrink-0 place-items-center rounded-full border-2 text-xs font-bold";
  if (state === "done") {
    return (
      <span className={`${base} border-ok bg-ok text-white`}>
        <IconCheck className="size-4" />
      </span>
    );
  }
  if (state === "rejected") {
    return (
      <span className={`${base} border-danger bg-danger text-white`}>
        <IconAlert className="size-4" />
      </span>
    );
  }
  if (state === "current") {
    return (
      <span className={`${base} border-warn bg-warn/10 text-warn`}>
        <IconClock className="size-4" />
      </span>
    );
  }
  return (
    <span className={`${base} border-hairline-strong bg-canvas text-ink-faint`}>{index + 1}</span>
  );
}

function when(at?: string | null): string | null {
  return at ? new Date(at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : null;
}

/** Full timeline: vertical on phones, horizontal from `sm` up. */
export function WorkflowProgress(props: ProgressInput) {
  const steps = buildSteps(props);
  return (
    <ol className="grid gap-4 sm:grid-cols-4 sm:gap-2" aria-label="Alur persetujuan">
      {steps.map((step, index) => (
        <li key={step.title} className="relative flex gap-3 sm:flex-col sm:items-center sm:text-center">
          {index < steps.length - 1 ? (
            <span
              aria-hidden
              className={`absolute top-8 left-4 h-[calc(100%-1rem)] w-0.5 sm:top-4 sm:left-[calc(50%+1.25rem)] sm:h-0.5 sm:w-[calc(100%-2.5rem)] ${
                step.state === "done" ? "bg-ok" : "bg-hairline-strong"
              }`}
            />
          ) : null}
          <Marker state={step.state} index={index} />
          <div className="min-w-0 pb-1">
            <p className="text-sm font-semibold text-ink">{step.title}</p>
            <p
              className={`text-xs ${
                step.state === "done"
                  ? "text-ok"
                  : step.state === "rejected"
                    ? "text-danger"
                    : step.state === "current"
                      ? "text-warn"
                      : "text-ink-faint"
              }`}
            >
              {CAPTION[step.state]}
              {when(step.at) ? ` · ${when(step.at)}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Four dots for a table row. The title of each dot names the step. */
export function WorkflowDots(props: ProgressInput) {
  const steps = buildSteps(props);
  const colour: Record<StepState, string> = {
    done: "bg-ok",
    current: "bg-warn ring-2 ring-warn/30",
    waiting: "bg-hairline-strong",
    rejected: "bg-danger",
    skipped: "bg-hairline",
  };
  return (
    <span className="inline-flex items-center gap-1.5" aria-label="Progres persetujuan">
      {steps.map((step, index) => (
        <span key={step.title} className="inline-flex items-center gap-1.5">
          <span title={`${step.title}: ${CAPTION[step.state]}`} className={`size-2.5 rounded-full ${colour[step.state]}`} />
          {index < steps.length - 1 ? <span aria-hidden className="h-px w-3 bg-hairline-strong" /> : null}
        </span>
      ))}
    </span>
  );
}
