import type { EmployeeStatus } from "@/lib/types";

/**
 * What an account's status looks like.
 *
 * Two states, because an account is either usable or it is not. Anything about
 * a change somebody has *asked* for belongs to the request that asks for it —
 * see PendingBadge — and mixing the two is how the roster came to report a
 * request's progress as though it were a fact about the person.
 */
const EMPLOYEE_STATUS_PRESENTATION: Record<
  EmployeeStatus,
  { label: string; className: string; dot: string }
> = {
  ACTIVE: {
    label: "Aktif",
    className: "border-ok/30 bg-ok/10 text-ok",
    dot: "bg-ok",
  },
  DISABLED: {
    label: "Nonaktif",
    className: "border-hairline-strong bg-elevated text-ink-muted",
    dot: "bg-ink-faint",
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
