import type { ReactNode } from "react";

import { IconAlert, IconCheck } from "@/components/ui/Icons";

type Tone = "error" | "success" | "info" | "warn";

const STYLES: Record<Tone, string> = {
  error: "border-danger/30 bg-danger/10 text-danger",
  success: "border-ok/30 bg-ok/10 text-ok",
  info: "border-info/40 bg-info/10 text-info",
  warn: "border-warn/40 bg-warn/10 text-warn",
};

/**
 * A small inline alert for forms. Renders nothing when there is no message, so a
 * caller can pass a possibly-null value straight in without guarding it.
 */
export function FormAlert({ tone = "error", children }: { tone?: Tone; children?: ReactNode }) {
  if (!children) return null;
  const Icon = tone === "success" ? IconCheck : IconAlert;
  return (
    <div role="alert" className={`flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm ${STYLES[tone]}`}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
