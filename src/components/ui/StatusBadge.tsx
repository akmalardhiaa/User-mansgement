import type { EmployeeStatus, RequestStage, RequestType } from "@/lib/types";

/** Presentation metadata for every employee status, kept in one place. */
const EMPLOYEE_STATUS_PRESENTATION: Record<
  EmployeeStatus,
  { label: string; className: string; dot: string }
> = {
  PENDING_MANAGER_APPROVAL: {
    label: "Menunggu manager",
    className: "border-warn/30 bg-warn/10 text-warn",
    dot: "bg-warn",
  },
  PENDING_SECURITY_SETUP: {
    label: "Penyiapan IT Security",
    className: "border-info/30 bg-info/10 text-info",
    dot: "bg-info",
  },
  ACTIVE: {
    label: "Aktif",
    className: "border-ok/30 bg-ok/10 text-ok",
    dot: "bg-ok",
  },
  DISABLED: {
    label: "Dinonaktifkan",
    className: "border-hairline-strong bg-elevated text-ink-muted",
    dot: "bg-ink-faint",
  },
  REJECTED: {
    label: "Ditolak",
    className: "border-danger/30 bg-danger/10 text-danger",
    dot: "bg-danger",
  },
  PENDING_TRANSFER_APPROVAL: {
    label: "Pindah divisi · menunggu manager",
    className: "border-warn/30 bg-warn/10 text-warn",
    dot: "bg-warn",
  },
  PENDING_TRANSFER_SETUP: {
    label: "Pindah divisi · IT Security",
    className: "border-info/30 bg-info/10 text-info",
    dot: "bg-info",
  },
  PENDING_OFFBOARDING_APPROVAL: {
    label: "Penonaktifan · menunggu manager",
    className: "border-warn/30 bg-warn/10 text-warn",
    dot: "bg-warn",
  },
  PENDING_OFFBOARDING_SETUP: {
    label: "Penonaktifan · IT Security",
    className: "border-info/30 bg-info/10 text-info",
    dot: "bg-info",
  },
};

export function employeeStatusLabel(status: EmployeeStatus): string {
  return EMPLOYEE_STATUS_PRESENTATION[status].label;
}

export function StatusBadge({ status }: { status: EmployeeStatus }) {
  const { label, className, dot } = EMPLOYEE_STATUS_PRESENTATION[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${className}`}
    >
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

const STAGE_PRESENTATION: Record<
  RequestStage,
  { label: string; transferLabel?: string; offboardingLabel?: string; className: string }
> = {
  MANAGER_APPROVAL: { label: "Persetujuan manager", className: "border-warn/30 bg-warn/10 text-warn" },
  SECURITY_PROVISIONING: {
    label: "Penyiapan akses IT Security",
    transferLabel: "Penyesuaian akses IT Security",
    offboardingLabel: "Pencabutan akses IT Security",
    className: "border-info/30 bg-info/10 text-info",
  },
  COMPLETED: { label: "Selesai", className: "border-ok/30 bg-ok/10 text-ok" },
  REJECTED: { label: "Ditolak", className: "border-danger/30 bg-danger/10 text-danger" },
};

export function StageBadge({ stage, type }: { stage: RequestStage; type?: RequestType }) {
  const presentation = STAGE_PRESENTATION[stage];
  const className = presentation.className;
  // Each flow gets its own wording for a stage where it has one, and falls
  // back to the neutral label where it does not — so adding a flow cannot
  // silently render a stage name belonging to a different process.
  const label =
    (type === "TRANSFER"
      ? presentation.transferLabel
      : type === "OFFBOARDING"
        ? presentation.offboardingLabel
        : undefined) ?? presentation.label;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${className}`}
    >
      {label}
    </span>
  );
}
