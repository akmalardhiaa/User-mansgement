"use client";

import type { AdDiagnosticReport, AdCheckStatus } from "@/lib/ad/diagnostics";

import { useT } from "@/components/i18n/LocaleProvider";
import { Card } from "@/components/ui/Field";

const STATUS_CLASS: Record<AdCheckStatus, string> = {
  ok: "border-ok/30 bg-ok/10 text-ok",
  warn: "border-warn/30 bg-warn/10 text-warn",
  fail: "border-danger/30 bg-danger/10 text-danger",
  skip: "border-hairline-strong bg-elevated text-ink-muted",
};

function overallLabel(status: AdCheckStatus, t: ReturnType<typeof useT>["adStatus"]): string {
  switch (status) {
    case "ok":
      return t.overallOk;
    case "warn":
      return t.overallWarn;
    case "fail":
      return t.overallFail;
    case "skip":
      return t.overallSkip;
  }
}

export function AdStatusView({ report }: { report: AdDiagnosticReport }) {
  const t = useT();
  const checkedAt = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(report.checkedAt));
  const labels: Record<AdCheckStatus, string> = {
    ok: t.adStatus.statusOk,
    warn: t.adStatus.statusWarn,
    fail: t.adStatus.statusFail,
    skip: t.adStatus.statusSkip,
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink">{t.adStatus.summary}</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-ink-muted">{t.adStatus.overall}</dt>
            <dd className="mt-1 font-semibold text-ink">{overallLabel(report.overall, t.adStatus)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">{t.adStatus.driver}</dt>
            <dd className="mt-1 font-semibold text-ink">{report.driver}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">{t.adStatus.writeMode}</dt>
            <dd className="mt-1 font-semibold text-ink">
              {report.writeEnabled ? t.adStatus.enabled : t.adStatus.readOnly}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">{t.adStatus.checkedAt}</dt>
            <dd className="mt-1 font-semibold text-ink">{checkedAt} WIB</dd>
          </div>
        </dl>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink">{t.adStatus.checks}</h2>
        <ul className="mt-3 divide-y divide-hairline">
          {report.checks.map((check) => (
            <li key={check.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-ink">
                  {t.adStatus.checkNames[check.id] ?? check.id}
                </h3>
                <p className="mt-1 break-words text-sm text-ink-muted">{check.message}</p>
              </div>
              <span
                className={`inline-flex w-fit shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[check.status]}`}
              >
                {labels[check.status]}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
