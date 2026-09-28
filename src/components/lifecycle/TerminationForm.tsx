"use client";

import { useState } from "react";

import { createAndSubmit, reviseAndResubmit } from "@/components/lifecycle/submitRequest";
import { useT } from "@/components/i18n/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { Card, Field, SelectField } from "@/components/ui/Field";
import { FormAlert } from "@/components/ui/FormAlert";
import { IconAlert, IconClock, IconNote, IconUser } from "@/components/ui/Icons";
import type { Dictionary } from "@/lib/i18n/dictionaries/id";
import { TERMINATION_REASONS, type LifecycleRequest, type TerminationReason } from "@/lib/lifecycle/types";
import type { Employee } from "@/lib/types";
import { DATE_BOUNDS, dateInputBounds } from "@/lib/validation/dates";

const SECTION =
  "mb-4 flex items-center gap-2 text-xs font-medium tracking-[0.14em] text-ink-faint uppercase";

/** Reason keys to dictionary keys; the words live with the other form words. */
const REASON_LABEL: Record<TerminationReason, keyof Dictionary["forms"]> = {
  RESIGN: "reasonResign",
  CONTRACT_END: "reasonContractEnd",
  RETIREMENT: "reasonRetire",
  TERMINATION: "reasonDismissal",
  OTHER: "reasonOther",
};

/**
 * Closing an account down.
 *
 * Two things this form is careful about.
 *
 * The reason is a category, not prose. The reason travels to two approvers, and
 * the circumstances of somebody leaving are not something to copy into inboxes;
 * the internal note stays here and is never put in an approval email.
 *
 * And the wording below the form is not reassurance, it is scope. Disabling an
 * account in the directory does not tear down sessions that are already open —
 * a Kerberos ticket, a VPN tunnel, a signed-in cloud session all outlive it.
 * Saying so here is the difference between HC knowing what they have asked for
 * and HC believing access ended the moment this was approved.
 */
export function TerminationForm({
  employees,
  initialEmployeeId,
  revise,
  onSubmitted,
}: {
  /** Already excludes anyone with a request in flight — except when revising. */
  employees: Employee[];
  initialEmployeeId?: string;
  /** The request being revised. Its subject is fixed; everything else starts from it. */
  revise?: LifecycleRequest;
  onSubmitted: (request: LifecycleRequest) => void;
}) {
  const previous = revise?.payload.kind === "TERMINATION" ? revise.payload : undefined;
  const [employeeId, setEmployeeId] = useState(previous?.employeeId ?? initialEmployeeId ?? "");
  const t = useT();
  const [values, setValues] = useState({
    reasonCategory: previous?.reasonCategory ?? "RESIGN",
    lastWorkingDate: previous?.lastWorkingDate.slice(0, 10) ?? "",
    handoverTo: previous?.handoverTo ?? "",
    note: previous?.note ?? "",
    effectiveAt: revise?.effectiveAt?.slice(0, 10) ?? "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const employee = employees.find((candidate) => candidate.id === employeeId);

  function update(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const body = {
      type: "TERMINATION",
      employeeId,
      ...values,
      handoverTo: values.handoverTo || undefined,
      note: values.note || undefined,
      effectiveAt: values.effectiveAt || undefined,
    };
    const result = revise
      ? await reviseAndResubmit(revise.id, revise.version, body)
      : await createAndSubmit(body);

    if (result.ok) {
      onSubmitted(result.request);
    } else {
      setFieldErrors(result.failure.fieldErrors ?? {});
      setFormError(result.failure.fieldErrors ? null : result.failure.message);
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} noValidate className="space-y-8">
        <FormAlert tone="error">{formError}</FormAlert>

        <div>
          <p className={SECTION}>
            <IconUser className="size-3.5" />
            {t.execution.sectionWhoLeaves}
          </p>
          <SelectField
            label={t.forms.employee}
            name="employeeId"
            icon={<IconUser className="size-4" />}
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            error={fieldErrors.employeeId}
            disabled={Boolean(revise)}
            hint={
              revise
                ? t.execution.subjectLocked
                : t.execution.subjectInFlight
            }
          >
            <option value="">{t.forms.chooseEmployee}</option>
            {employees.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.displayName} · {candidate.department}
              </option>
            ))}
          </SelectField>

          {employee ? (
            <div className="mt-4 rounded-xl border border-hairline bg-elevated/40 p-4 text-sm">
              <p className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
                {t.execution.sectionAffected}
              </p>
              <dl className="mt-2.5 space-y-1.5">
                {[
                  [t.summary.name, employee.displayName],
                  [t.summary.email, employee.email],
                  [t.forms.jobTitle, `${employee.jobTitle} · ${employee.department}`],
                  [t.forms.manager, employee.managerName],
                ].map(([label, value]) => (
                  <div key={label} className="flex gap-3">
                    <dt className="w-24 shrink-0 text-xs text-ink-faint">{label}</dt>
                    <dd className="min-w-0 truncate font-medium text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 border-t border-hairline pt-2.5 text-xs text-ink-muted">
                {t.execution.firstApproverIs.split("{name}")[0]}
                <strong className="text-ink">{employee.managerName}</strong>
                {t.execution.firstApproverIs.split("{name}")[1]}
              </p>
            </div>
          ) : null}
        </div>

        <div>
          <p className={SECTION}>
            <IconNote className="size-3.5" />
            {t.execution.sectionReasonSchedule}
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              label={t.forms.reasonCategory}
              name="reasonCategory"
              value={values.reasonCategory}
              onChange={(event) => update("reasonCategory", event.target.value)}
              error={fieldErrors.reasonCategory}
              hint={t.forms.reasonCategoryHint}
            >
              {TERMINATION_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {t.forms[REASON_LABEL[reason]]}
                </option>
              ))}
            </SelectField>

            <Field
              label={t.forms.lastWorkingDate}
              name="lastWorkingDate"
              type="date"
              {...dateInputBounds(DATE_BOUNDS.lastWorkingDate)}
              icon={<IconClock className="size-4" />}
              value={values.lastWorkingDate}
              onChange={(event) => update("lastWorkingDate", event.target.value)}
              error={fieldErrors.lastWorkingDate}
            />

            <Field
              label={t.forms.disableAt}
              name="effectiveAt"
              type="date"
              {...dateInputBounds(DATE_BOUNDS.effectiveAt)}
              icon={<IconClock className="size-4" />}
              value={values.effectiveAt}
              onChange={(event) => update("effectiveAt", event.target.value)}
              error={fieldErrors.effectiveAt}
              hint={t.forms.effectiveAtHint}
            />

          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3.5 py-3 text-xs leading-relaxed text-warn">
          <IconAlert className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1.5">
            <p>
              {t.execution.quarantineBefore}
              <strong>{t.execution.quarantineStrong}</strong>
              {t.execution.quarantineAfter}
            </p>
            <p>
              {t.execution.sessionsNote}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
          <Button type="submit" variant="danger" loading={submitting} disabled={!employeeId}>
            {submitting ? t.forms.submitting : revise ? t.forms.submitRevision : t.forms.submit}
          </Button>
          <p className="text-xs text-ink-faint">
            Akses belum dicabut. Pengajuan dikirim ke manager, lalu CISO.
          </p>
        </div>
      </form>
    </Card>
  );
}
