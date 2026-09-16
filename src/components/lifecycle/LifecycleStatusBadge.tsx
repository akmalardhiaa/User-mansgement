import type { LifecycleStatus, LifecycleType } from "@/lib/lifecycle/types";

/**
 * Where a request stands.
 *
 * The colours carry the meaning the plan insists on: APPROVED is not a success
 * state. It is amber like the stages before it, because the change has been
 * authorised and has not happened yet. Only COMPLETED — a change executed and
 * read back — earns green.
 */
const PRESENTATION: Record<LifecycleStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draf", className: "border-hairline-strong bg-elevated text-ink-muted" },
  PENDING_MANAGER: { label: "Menunggu manager", className: "border-warn/30 bg-warn/10 text-warn" },
  PENDING_CISO: { label: "Menunggu CISO", className: "border-warn/30 bg-warn/10 text-warn" },
  APPROVED: { label: "Disetujui", className: "border-info/30 bg-info/10 text-info" },
  SCHEDULED: { label: "Terjadwal", className: "border-info/30 bg-info/10 text-info" },
  QUEUED: { label: "Antre eksekusi", className: "border-info/30 bg-info/10 text-info" },
  EXECUTING: { label: "Sedang dijalankan", className: "border-info/30 bg-info/10 text-info" },
  COMPLETED: { label: "Selesai", className: "border-ok/30 bg-ok/10 text-ok" },
  FAILED: { label: "Gagal", className: "border-danger/30 bg-danger/10 text-danger" },
  REJECTED: { label: "Ditolak", className: "border-danger/30 bg-danger/10 text-danger" },
  CANCELLED: { label: "Dibatalkan", className: "border-hairline-strong bg-elevated text-ink-muted" },
  EXPIRED: { label: "Kedaluwarsa", className: "border-hairline-strong bg-elevated text-ink-muted" },
};

export function lifecycleStatusLabel(status: LifecycleStatus): string {
  return PRESENTATION[status].label;
}

export function LifecycleStatusBadge({ status }: { status: LifecycleStatus }) {
  const { label, className } = PRESENTATION[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${className}`}
    >
      {label}
    </span>
  );
}

const TYPE_PRESENTATION: Record<LifecycleType, { label: string; className: string }> = {
  ONBOARDING: { label: "Onboarding", className: "border-ok/30 bg-ok/10 text-ok" },
  MOVEMENT: { label: "Movement", className: "border-info/30 bg-info/10 text-info" },
  TERMINATION: { label: "Termination", className: "border-danger/30 bg-danger/10 text-danger" },
};

export function LifecycleTypeBadge({ type }: { type: LifecycleType }) {
  const { label, className } = TYPE_PRESENTATION[type];
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${className}`}
    >
      {label}
    </span>
  );
}
