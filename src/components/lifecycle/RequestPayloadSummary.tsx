"use client";

import { useT } from "@/components/i18n/LocaleProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries/id";
import { accessProfileLabel } from "@/lib/lifecycle/accessProfiles";
import { isFixedTerm } from "@/lib/lifecycle/employment";
import { employmentLabel } from "@/lib/i18n/labels";
import type {
  LifecyclePayload,
  ProfileUpdatePayload,
  TerminationReason,
} from "@/lib/lifecycle/types";

const REASON_LABEL: Record<TerminationReason, keyof Dictionary["forms"]> = {
  RESIGN: "reasonResign",
  CONTRACT_END: "reasonContractEnd",
  RETIREMENT: "reasonRetire",
  TERMINATION: "reasonDismissal",
  OTHER: "reasonOther",
};

/**
 * The locked payload, as the approvers see it.
 *
 * This is what the fingerprint covers, so it is rendered from the stored
 * payload rather than reassembled from the employee record: an approver must be
 * looking at the same text the hash was taken over, not at a live join that
 * could have moved underneath it.
 *
 * The termination note is deliberately absent. It is an internal HC note, it is
 * not part of what an approver needs in order to decide, and the plan is
 * explicit that the circumstances of somebody leaving do not travel further
 * than they must.
 */
export function RequestPayloadSummary({ payload }: { payload: LifecyclePayload }) {
  const t = useT();
  if (payload.kind === "PROFILE_UPDATE") return <ProfileChanges payload={payload} />;

  const rows: Array<[string, string]> =
    payload.kind === "ONBOARDING"
      ? [
          [t.summary.name, payload.displayName],
          [t.summary.email, payload.email],
          [t.summary.jobTitle, payload.jobTitle],
          [t.summary.department, payload.department],
          [
            t.summary.employmentType,
            isFixedTerm(payload.employmentType)
              ? `${employmentLabel(t, payload.employmentType)} · ${t.summary.endsOn.replace("{date}", payload.expiredDate ?? "—")}`
              : employmentLabel(t, payload.employmentType),
          ],
          [
            t.summary.location,
            payload.locationType === "CABANG"
              ? t.summary.branchNamed.replace("{name}", payload.branchName ?? "—")
              : t.summary.headOffice,
          ],
          [t.summary.manager, `${payload.managerName} · ${payload.managerEmail}`],
          [t.summary.startDate, payload.startDate],
          [t.summary.accessProfile, accessProfileLabel(payload.accessProfileId)],
          ...(payload.jobDescription
            ? [[t.summary.jobDescription, payload.jobDescription] as [string, string]]
            : []),
        ]
      : payload.kind === "MOVEMENT"
        ? [
            [t.summary.toDepartment, payload.toDepartment],
            [t.summary.toJobTitle, payload.toJobTitle],
            [t.summary.toManager, `${payload.toManagerName} · ${payload.toManagerEmail}`],
            [t.summary.newAccessProfile, accessProfileLabel(payload.accessProfileId)],
            ...(payload.reason ? [[t.summary.reason, payload.reason] as [string, string]] : []),
            ...(payload.toJobDescription
              ? [[t.summary.jobDescription, payload.toJobDescription] as [string, string]]
              : []),
          ]
        : [
            [t.summary.reasonCategory, t.forms[REASON_LABEL[payload.reasonCategory]]],
            [t.summary.lastWorkingDate, payload.lastWorkingDate],
            ...(payload.handoverTo
              ? [[t.summary.handoverTo, payload.handoverTo] as [string, string]]
              : []),
            [t.summary.action, t.summary.terminationAction],
          ];

  return (
    <dl className="divide-y divide-hairline/60">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 py-2.5 sm:grid-cols-[13rem_1fr] sm:gap-3">
          <dt className="text-sm text-ink-muted">{label}</dt>
          <dd className="text-sm font-medium break-words text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A profile update, as a before-and-after table.
 *
 * Only the changed fields, because that is what is being decided. The "before"
 * column is the server's reading of the record at submit, not the browser's.
 */
function ProfileChanges({ payload }: { payload: ProfileUpdatePayload }) {
  const t = useT();

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-hairline">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-hairline bg-elevated/40 text-xs tracking-wide text-ink-faint uppercase">
              <th className="px-3 py-2.5 font-medium sm:px-4">{t.summary.field}</th>
              <th className="px-3 py-2.5 font-medium sm:px-4">{t.summary.before}</th>
              <th className="px-3 py-2.5 font-medium sm:px-4">{t.summary.after}</th>
            </tr>
          </thead>
          <tbody>
            {payload.changes.map((change) => (
              <tr key={change.field} className="border-b border-hairline/60 last:border-0">
                <td className="px-3 py-2.5 text-ink-muted sm:px-4">{change.label}</td>
                <td className="px-3 py-2.5 break-words text-ink-muted line-through decoration-ink-faint/60 sm:px-4">
                  {change.from}
                </td>
                <td className="px-3 py-2.5 font-medium break-words text-accent sm:px-4">{change.to}</td>
              </tr>
            ))}
            {payload.changes.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-ink-muted sm:px-4">
                  {t.summary.changesComputed}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-faint">
        {t.summary.profileScopeNote}
      </p>
    </div>
  );
}
