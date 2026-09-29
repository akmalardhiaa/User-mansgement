"use client";

import { useT } from "@/components/i18n/LocaleProvider";
import { Card } from "@/components/ui/Field";
import type { Dictionary } from "@/lib/i18n/dictionaries/id";
import type { ExecutionJob } from "@/lib/lifecycle/executionTypes";

/**
 * What the worker actually did to the directory.
 *
 * Step by step, with the ones that failed shown as failed. This is the screen
 * that has to be honest when things go wrong: an onboarding that created an
 * account and then could not grant its groups left something real behind, and
 * an operator deciding what to do next needs to see exactly how far it got —
 * not a single red word.
 */

const ERROR_LABEL: Record<string, keyof Dictionary["execution"]> = {
  DRIFT: "drift",
  PAYLOAD_MISMATCH: "payloadMismatch",
  AD_PERMISSION: "adPermission",
  AD_CONFLICT: "adConflict",
  AD_NOT_FOUND: "adNotFound",
  AD_TIMEOUT_AFTER_WRITE: "adTimeout",
  AD_UNAVAILABLE: "adUnavailable",
  VERIFY_FAILED: "verifyFailed",
  UNKNOWN: "unknown",
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}

export function ExecutionTimeline({ jobs }: { jobs: ExecutionJob[] }) {
  const t = useT();
  if (jobs.length === 0) return null;

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-ink">{t.execution.timelineTitle}</h2>

      {jobs.map((job) => (
        <div key={job.operationId} className="mt-4">
          <p className="font-mono text-[11px] break-all text-ink-faint">
            {job.operationId} · percobaan {job.attempt}
          </p>

          <ol className="mt-3 space-y-2.5">
            {job.steps.map((step) => (
              <li key={`${job.operationId}-${step.stepKey}`} className="flex items-start gap-2.5">
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${
                    step.state === "DONE" ? "bg-ok" : step.state === "FAILED" ? "bg-danger" : "bg-ink-faint"
                  }`}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block font-mono text-xs text-ink">{step.stepKey}</span>
                  {step.errorMessage ? (
                    <span className="block text-xs text-danger">{step.errorMessage}</span>
                  ) : null}
                  {step.at ? (
                    <span className="block text-[11px] text-ink-faint">{formatDate(step.at)}</span>
                  ) : null}
                </span>
              </li>
            ))}
            {job.steps.length === 0 ? (
              <li className="text-xs text-ink-muted">
                Belum ada langkah yang dijalankan — dihentikan sebelum menyentuh direktori.
              </li>
            ) : null}
          </ol>

          {job.errorCode ? (
            <div className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-xs text-danger">
              <p className="font-semibold">{ERROR_LABEL[job.errorCode] ? t.execution[ERROR_LABEL[job.errorCode]] : job.errorCode}</p>
              {job.errorMessage ? <p className="mt-0.5">{job.errorMessage}</p> : null}
              {job.errorCode === "DRIFT" ? (
                <p className="mt-1.5 text-ink-muted">
                  Mengulang tidak akan membantu: persetujuan diberikan untuk keadaan yang sudah
                  tidak berlaku. Ajukan ulang agar kedua approver menilai keadaan sekarang.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </Card>
  );
}
