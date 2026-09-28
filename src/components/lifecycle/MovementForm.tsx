"use client";

import { useState } from "react";

import { createAndSubmit, reviseAndResubmit } from "@/components/lifecycle/submitRequest";
import { useT } from "@/components/i18n/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { Card, Field, SelectField, TextareaField } from "@/components/ui/Field";
import { FormAlert } from "@/components/ui/FormAlert";
import {
  IconBriefcase,
  IconBuilding,
  IconClock,
  IconNote,
  IconSwap,
  IconUser,
} from "@/components/ui/Icons";
import { ManagerPicker } from "@/components/users/ManagerPicker";
import { ACCESS_PROFILES } from "@/lib/lifecycle/accessProfiles";
import type { LifecycleRequest } from "@/lib/lifecycle/types";
import { ComboField } from "@/components/ui/ComboField";
import { DEPARTMENT_GROUPS, JOB_TITLE_GROUPS } from "@/lib/db/seed";
import type { Employee } from "@/lib/types";
import { DATE_BOUNDS, dateInputBounds } from "@/lib/validation/dates";

const SECTION =
  "mb-4 flex items-center gap-2 text-xs font-medium tracking-[0.14em] text-ink-faint uppercase";

/**
 * Moving somebody between divisions.
 *
 * The before-and-after panel is the point of this form. A move is a diff, and
 * showing only the destination leaves the approver guessing what is actually
 * changing — which is how a "move" that alters a manager and an access profile
 * gets waved through as though it were a job-title correction.
 */
export function MovementForm({
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
  const previous = revise?.payload.kind === "MOVEMENT" ? revise.payload : undefined;
  const [employeeId, setEmployeeId] = useState(previous?.employeeId ?? initialEmployeeId ?? "");
  const t = useT();
  const [values, setValues] = useState({
    toDepartment: previous?.toDepartment ?? "",
    toJobTitle: previous?.toJobTitle ?? "",
    toJobDescription: previous?.toJobDescription ?? "",
    toManagerName: previous?.toManagerName ?? "",
    toManagerEmail: previous?.toManagerEmail ?? "",
    accessProfileId: previous?.accessProfileId ?? "standard",
    reason: previous?.reason ?? "",
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
      type: "MOVEMENT",
      employeeId,
      ...values,
      toJobDescription: values.toJobDescription || undefined,
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

  const diff: Array<[string, string, string]> = employee
    ? [
        [t.forms.department, employee.department, values.toDepartment || "—"],
        [t.forms.jobTitle, employee.jobTitle, values.toJobTitle || "—"],
        [t.forms.manager, employee.managerName, values.toManagerName || "—"],
      ]
    : [];

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} noValidate className="space-y-8">
        <FormAlert tone="error">{formError}</FormAlert>

        <div>
          <p className={SECTION}>
            <IconUser className="size-3.5" />
            Karyawan yang dipindahkan
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
        </div>

        {employee ? (
          <div>
            <p className={SECTION}>
              <IconSwap className="size-3.5" />
              Sebelum dan sesudah
            </p>
            <div className="overflow-hidden rounded-xl border border-hairline">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-elevated/40 text-xs tracking-wide text-ink-faint uppercase">
                    <th className="px-3 py-2.5 sm:px-4 font-medium">{t.forms.attribute}</th>
                    <th className="px-3 py-2.5 sm:px-4 font-medium">{t.forms.now}</th>
                    <th className="px-3 py-2.5 sm:px-4 font-medium">{t.forms.becomes}</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.map(([label, before, after]) => {
                    const changed = after !== "—" && before !== after;
                    return (
                      <tr key={label} className="border-b border-hairline/60 last:border-0">
                        <td className="px-3 py-2.5 sm:px-4 text-ink-muted">{label}</td>
                        <td className="px-3 py-2.5 sm:px-4 text-ink-muted line-through decoration-ink-faint/60">
                          {before}
                        </td>
                        <td
                          className={`px-3 py-2.5 sm:px-4 font-medium ${changed ? "text-accent" : "text-ink-faint"}`}
                        >
                          {after}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div>
          <p className={SECTION}>
            <IconBriefcase className="size-3.5" />
            Posisi tujuan
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <ComboField
              label={t.forms.toDepartment}
              name="toDepartment"
              groups={DEPARTMENT_GROUPS}
              icon={<IconBuilding className="size-4" />}
              value={values.toDepartment}
              onChange={(next) => update("toDepartment", next)}
              error={fieldErrors.toDepartment}
              hint={t.forms.departmentHint}
            />

            <ComboField
              label={t.forms.toJobTitle}
              name="toJobTitle"
              groups={JOB_TITLE_GROUPS}
              icon={<IconBriefcase className="size-4" />}
              value={values.toJobTitle}
              onChange={(next) => update("toJobTitle", next)}
              error={fieldErrors.toJobTitle}
              placeholder="Security Engineer"
              hint={t.forms.jobTitleHint}
            />

            <Field
              label={t.forms.effectiveAt}
              name="effectiveAt"
              type="date"
              {...dateInputBounds(DATE_BOUNDS.effectiveAt)}
              icon={<IconClock className="size-4" />}
              value={values.effectiveAt}
              onChange={(event) => update("effectiveAt", event.target.value)}
              error={fieldErrors.effectiveAt}
              hint={t.forms.effectiveAtHint}
            />

            <SelectField
              label={t.forms.newAccessProfile}
              name="accessProfileId"
              value={values.accessProfileId}
              onChange={(event) => update("accessProfileId", event.target.value)}
              error={fieldErrors.accessProfileId}
              hint={
                ACCESS_PROFILES.find((profile) => profile.id === values.accessProfileId)
                  ?.description
              }
            >
              {ACCESS_PROFILES.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                </option>
              ))}
            </SelectField>

            <TextareaField
              label={t.forms.newJobDescription}
              name="toJobDescription"
              rows={2}
              icon={<IconNote className="size-4" />}
              value={values.toJobDescription}
              onChange={(event) => update("toJobDescription", event.target.value)}
              error={fieldErrors.toJobDescription}
              className="sm:col-span-2"
            />

            <TextareaField
              label={t.forms.movementReason}
              name="reason"
              rows={2}
              icon={<IconNote className="size-4" />}
              value={values.reason}
              onChange={(event) => update("reason", event.target.value)}
              error={fieldErrors.reason}
              placeholder={t.forms.movementReasonPlaceholder}
              hint={t.forms.readByApprovers}
              className="sm:col-span-2"
            />
          </div>
        </div>

        <div>
          <p className={SECTION}>{t.forms.toManager}</p>
          <ManagerPicker
            employees={employees}
            value={{ managerName: values.toManagerName, managerEmail: values.toManagerEmail }}
            onChange={(next) =>
              setValues((current) => ({
                ...current,
                toManagerName: next.managerName,
                toManagerEmail: next.managerEmail,
              }))
            }
            nameError={fieldErrors.toManagerName}
            emailError={fieldErrors.toManagerEmail}
          />
          <p className="mt-2 text-xs text-ink-faint">
            Persetujuan tahap pertama diminta ke manager divisi tujuan — merekalah yang menerima
            karyawan ini.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
          <Button type="submit" loading={submitting} disabled={!employeeId}>
            {submitting ? t.forms.submitting : revise ? t.forms.submitRevision : t.forms.submit}
          </Button>
          <p className="text-xs text-ink-faint">
            Posisi belum berubah. Direktori tetap menampilkan posisi sekarang sampai perubahan
            dijalankan.
          </p>
        </div>
      </form>
    </Card>
  );
}
