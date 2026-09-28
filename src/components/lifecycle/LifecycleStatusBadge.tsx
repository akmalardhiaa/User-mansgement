"use client";

import { useT } from "@/components/i18n/LocaleProvider";
import { lifecycleStatusLabel, lifecycleTypeLabel } from "@/lib/i18n/labels";
import type { LifecycleStatus, LifecycleType } from "@/lib/lifecycle/types";

/**
 * Where a request stands.
 *
 * The colours carry the meaning the plan insists on: APPROVED is not a success
 * state. It is amber like the stages before it, because the change has been
 * authorised and has not happened yet. Only COMPLETED — a change executed and
 * read back — earns green.
 */
const PRESENTATION: Record<LifecycleStatus, string> = {
  DRAFT: "border-hairline-strong bg-elevated text-ink-muted",
  PENDING_MANAGER: "border-warn/30 bg-warn/10 text-warn",
  PENDING_CISO: "border-warn/30 bg-warn/10 text-warn",
  APPROVED: "border-info/30 bg-info/10 text-info",
  SCHEDULED: "border-info/30 bg-info/10 text-info",
  QUEUED: "border-info/30 bg-info/10 text-info",
  EXECUTING: "border-info/30 bg-info/10 text-info",
  COMPLETED: "border-ok/30 bg-ok/10 text-ok",
  FAILED: "border-danger/30 bg-danger/10 text-danger",
  REJECTED: "border-danger/30 bg-danger/10 text-danger",
  CANCELLED: "border-hairline-strong bg-elevated text-ink-muted",
  EXPIRED: "border-hairline-strong bg-elevated text-ink-muted",
};

export function LifecycleStatusBadge({ status }: { status: LifecycleStatus }) {
  const t = useT();
  const className = PRESENTATION[status];
  const label = lifecycleStatusLabel(t, status);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${className}`}
    >
      {label}
    </span>
  );
}

const TYPE_PRESENTATION: Record<LifecycleType, string> = {
  ONBOARDING: "border-ok/30 bg-ok/10 text-ok",
  MOVEMENT: "border-info/30 bg-info/10 text-info",
  TERMINATION: "border-danger/30 bg-danger/10 text-danger",
  PROFILE_UPDATE: "border-accent/30 bg-accent/10 text-accent",
};

export function LifecycleTypeBadge({ type }: { type: LifecycleType }) {
  const t = useT();
  const className = TYPE_PRESENTATION[type];
  const label = lifecycleTypeLabel(t, type);
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${className}`}
    >
      {label}
    </span>
  );
}
