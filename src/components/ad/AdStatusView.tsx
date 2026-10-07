"use client";

import type { AdDiagnosticCheck, AdDiagnosticReport, AdCheckStatus } from "@/lib/ad/diagnostics";
import type { SecurityEvent } from "@/lib/auth/securityLog";

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

      <CheckList title={t.adStatus.checks} checks={report.checks} />
    </div>
  );
}

/** A titled list of checks, for the directory and for email and sign-in alike. */
export function CheckList({ title, checks }: { title: string; checks: AdDiagnosticCheck[] }) {
  const t = useT();
  const labels: Record<AdCheckStatus, string> = {
    ok: t.adStatus.statusOk,
    warn: t.adStatus.statusWarn,
    fail: t.adStatus.statusFail,
    skip: t.adStatus.statusSkip,
  };

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <ul className="mt-3 divide-y divide-hairline">
        {checks.map((check) => (
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
  );
}

/** The newest sign-ins and the sessions the AD check ended. Never a password or a code. */
export function SecurityLogCard({ events }: { events: SecurityEvent[] }) {
  const t = useT();
  const format = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "short",
    timeStyle: "medium",
  });

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ink">{t.adStatus.securityLogTitle}</h2>
      {events.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">{t.adStatus.securityLogEmpty}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-xs text-ink-muted">
              <tr>
                <th className="py-2 pr-3 font-medium">{t.adStatus.securityLogWhen}</th>
                <th className="py-2 pr-3 font-medium">{t.adStatus.securityLogAccount}</th>
                <th className="py-2 pr-3 font-medium">{t.adStatus.securityLogEvent}</th>
                <th className="py-2 font-medium">{t.adStatus.securityLogFrom}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {events.map((event, index) => (
                <tr key={`${event.at}-${index}`} className="align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-ink-muted">{format.format(new Date(event.at))}</td>
                  <td className="py-2 pr-3 text-ink">{event.username ?? "—"}</td>
                  <td className="py-2 pr-3 text-ink">
                    {t.adStatus.securityTypes[event.type] ?? event.type}
                    {event.detail ? <span className="block text-xs text-ink-muted">{event.detail}</span> : null}
                  </td>
                  <td className="py-2 whitespace-nowrap text-ink-muted">{event.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
