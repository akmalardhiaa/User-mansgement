"use client";

import { useState } from "react";

import { createAndSubmit, reviseAndResubmit } from "@/components/lifecycle/submitRequest";
import { useT } from "@/components/i18n/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { Card, Field, SelectField } from "@/components/ui/Field";
import { FormAlert } from "@/components/ui/FormAlert";
import { IconAlert, IconClock, IconNote, IconUser } from "@/components/ui/Icons";
import type { LifecycleRequest } from "@/lib/lifecycle/types";
import type { Employee } from "@/lib/types";
import { DATE_BOUNDS, dateInputBounds } from "@/lib/validation/dates";

const SECTION =
  "mb-1.5 flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-ink-faint uppercase";

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
  subjectChosenElsewhere = false,
  revise,
  onSubmitted,
}: {
  /** Already excludes anyone with a request in flight — except when revising. */
  employees: Employee[];
  initialEmployeeId?: string;
  /**
   * Whether the subject was already chosen on the page around this form.
   *
   * Opened from Edit profil it always is — the roster on the left IS the
   * choice — and repeating it as a dropdown with one option asks the same
   * question twice. The revision screen has no roster, so there it stays.
   */
  subjectChosenElsewhere?: boolean;
  /** The request being revised. Its subject is fixed; everything else starts from it. */
  revise?: LifecycleRequest;
  onSubmitted: (request: LifecycleRequest) => void;
}) {
  const previous = revise?.payload.kind === "TERMINATION" ? revise.payload : undefined;
  const [employeeId, setEmployeeId] = useState(previous?.employeeId ?? initialEmployeeId ?? "");
  const t = useT();
  const [values, setValues] = useState({
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
    <Card className="p-3.5">
      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        <FormAlert tone="error">{formError}</FormAlert>

        <div>
          {subjectChosenElsewhere ? null : (
            <>
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
                hint={revise ? t.execution.subjectLocked : t.execution.subjectInFlight}
              >
                <option value="">{t.forms.chooseEmployee}</option>
                {employees.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.displayName} · {candidate.department}
                  </option>
                ))}
              </SelectField>
            </>
          )}

          {/*
           * Who this closes, and who is asked first, on two lines.
           *
           * It was a four-row definition list — name, email, job, manager —
           * which is what the roster beside it already shows. What it adds, and
           * all it needs to add, is the account being closed and the person
           * whose approval is asked for it.
           */}
          {employee ? (
            <div
              className={`rounded-xl border border-hairline bg-elevated/40 px-3 py-2 ${
                subjectChosenElsewhere ? "" : "mt-3"
              }`}
            >
              <p className="text-sm text-ink">
                <span className="font-medium">{employee.displayName}</span>
                <span className="text-ink-muted"> · {employee.jobTitle}</span>
                <span className="text-ink-muted"> · {employee.department}</span>
                <span className="font-mono text-xs text-ink-faint"> · {employee.email}</span>
              </p>
              <p className="mt-0.5 text-xs leading-tight text-ink-muted">
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
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
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

        <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs leading-snug text-warn">
          <IconAlert className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
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

        <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-3">
          <Button type="submit" variant="danger" loading={submitting} disabled={!employeeId}>
            {submitting ? t.forms.submitting : revise ? t.forms.submitRevision : t.forms.submit}
          </Button>
          <p className="text-xs text-ink-faint">
            {t.execution.notRevokedYet}
          </p>
        </div>
      </form>
    </Card>
  );
}
