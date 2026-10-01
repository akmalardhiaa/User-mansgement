"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useT } from "@/components/i18n/LocaleProvider";
import { RequestSubmitted } from "@/components/lifecycle/RequestSubmitted";
import { createAndSubmit, reviseAndResubmit } from "@/components/lifecycle/submitRequest";
import { FormAlert } from "@/components/ui/FormAlert";
import { Button } from "@/components/ui/Button";
import { ChoiceField, type ChoiceGroup } from "@/components/ui/ChoiceField";
import { Card, Field, SelectField } from "@/components/ui/Field";
import { IconBriefcase, IconBuilding, IconUser } from "@/components/ui/Icons";
import { ManagerPicker } from "@/components/users/ManagerPicker";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { editIntent, type EditIntent } from "@/lib/lifecycle/editIntent";
import { diffProfile, profileOf } from "@/lib/lifecycle/profileUpdate";
import { EMPLOYMENT_TYPES, isFixedTerm } from "@/lib/lifecycle/employment";
import { employmentLabel } from "@/lib/i18n/labels";
import type { EmploymentType, LifecycleRequest, ProfileFields } from "@/lib/lifecycle/types";
import type { Employee } from "@/lib/types";
import { DATE_BOUNDS, dateInputBounds } from "@/lib/validation/dates";

/**
 * Edit an employee's profile — by asking for it.
 *
 * Saving no longer writes the record. It raises a PROFILE_UPDATE request that
 * goes to the employee's current manager and then the CISO, by email, exactly
 * like the other three request types; the profile only changes once both have
 * approved and the worker has applied it and read the result back.
 *
 * Email and manager are still not editable: the first ties the record to its
 * login account, and the second is who approves this very request.
 */
export function EditUserView({
  employees,
  pendingIds = [],
  initialEmployeeId,
}: {
  employees: Employee[];
  /**
   * Employees with a lifecycle request in flight. Their profile is locked: a
   * request in progress owns the fields it proposes to change, and editing them
   * underneath it would make the approved payload disagree with the record it
   * was raised from.
   */
  pendingIds?: string[];
  /** Who to select on arrival, for a link that arrives naming somebody. */
  initialEmployeeId?: string;
}) {
  const t = useT();
  const [selectedId, setSelectedId] = useState<string | null>(
    initialEmployeeId ?? employees[0]?.id ?? null,
  );
  // The roster itself never changes here: nothing is written until the request
  // is approved and executed. What changes is who now has a request in flight.
  const [pending, setPending] = useState<string[]>(pendingIds);
  const [submitted, setSubmitted] = useState<LifecycleRequest | null>(null);

  const selected = employees.find((employee) => employee.id === selectedId);
  const locked = selected ? pending.includes(selected.id) : false;

  /** One place to record that a request now exists for this person. */
  const raised = (request: LifecycleRequest) => {
    if (selected) setPending((current) => [...current, selected.id]);
    setSubmitted(request);
  };

  /*
   * Choosing the person is one control, not a column.
   *
   * It was a list down the left side with its own search box, which on a
   * laptop spent a third of the working width showing three names — and the
   * form, which is what this page is for, got whatever was left. The picker
   * below searches the whole roster and sits in the header of the form
   * itself, so the form opens at full width with its fields already visible.
   *
   * Somebody with a request in flight is still listed and still says so: they
   * are exactly who you go looking for when you want to know why.
   */
  const employeeOptions = useMemo<ChoiceGroup[]>(
    () => [
      {
        items: employees.map((employee) => ({
          value: employee.id,
          label: employee.displayName,
          meta: pending.includes(employee.id)
            ? `${employee.department} · ${t.editProfile.inFlight}`
            : employee.department,
        })),
      },
    ],
    [employees, pending, t],
  );

  return submitted ? (
    <RequestSubmitted request={submitted} onRaiseAnother={() => setSubmitted(null)} />
  ) : (
    <div className="space-y-3">
      {locked ? (
        <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs leading-snug text-warn">
          {t.editProfile.lockedNote}
        </p>
      ) : null}

      {/*
       * One form for everything that can be asked about one person.
       *
       * It was three tabs, and the tab was how HC told the portal which
       * request they meant — a question the portal can answer itself from what
       * was changed. See lifecycle/editIntent.ts for the rule, and for why two
       * kinds of change at once is refused rather than guessed.
       *
       * Keyed on the person, so picking somebody else remounts the form with
       * their values rather than leaving half of the last one behind.
       */}
      {selected ? (
        <EmployeeEditForm
          key={selected.id}
          employee={selected}
          employeeOptions={employeeOptions}
          onPick={(id) => {
            setSelectedId(id);
            setSubmitted(null);
          }}
          managerCandidates={employees}
          locked={locked}
          onSubmitted={raised}
        />
      ) : (
        <Card className="grid place-items-center p-10">
          <p className="text-sm text-ink-muted">{t.editProfile.pickSomeone}</p>
        </Card>
      )}
    </div>
  );
}

/**
 * The form values, as the profile the server will be asked to apply.
 *
 * The same normalisation the server does — a branch name only for a branch, an
 * end date only for a contract — so the preview below shows the diff the
 * approvers will actually be sent, not one that includes a hidden stale field.
 */
function toProfile(values: Record<string, string>): ProfileFields {
  const trimmed = (key: string) => values[key]?.trim() || undefined;
  const employmentType = trimmed("employmentType") as ProfileFields["employmentType"];
  const locationType = trimmed("locationType") as ProfileFields["locationType"];
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    displayName: values.displayName.trim(),
    jobTitle: values.jobTitle.trim(),
    jobDescription: trimmed("jobDescription"),
    department: values.department.trim(),
    employmentType,
    expiredDate: isFixedTerm(employmentType) ? trimmed("expiredDate") : undefined,
    locationType,
    branchName: locationType === "CABANG" ? trimmed("branchName") : undefined,
    description: trimmed("description"),
  };
}

/**
 * One employee's profile, raised as a request.
 *
 * Also the revision screen for a PROFILE_UPDATE: given `revise`, it starts from
 * the proposed profile rather than the record, and sends the new version back
 * to the approvers instead of raising a second request.
 */
export function ProfileForm({
  employee,
  locked,
  revise,
  onSubmitted,
}: {
  employee: Employee;
  locked: boolean;
  revise?: LifecycleRequest;
  onSubmitted: (request: LifecycleRequest) => void;
}) {
  const t = useT();
  const start: ProfileFields =
    revise?.payload.kind === "PROFILE_UPDATE" ? revise.payload.profile : profileOf(employee);

  const [values, setValues] = useState({
    firstName: start.firstName,
    lastName: start.lastName,
    displayName: start.displayName,
    jobTitle: start.jobTitle,
    /*
     * Carried through the form without being shown.
     *
     * Neither of these is edited here any more — HC asked for the two textareas
     * to go — but both are part of the profile the request proposes. Dropping
     * them from the values would send an empty one, and the diff would read as
     * "job description removed" for everybody who has one.
     */
    jobDescription: start.jobDescription ?? "",
    department: start.department,
    employmentType: start.employmentType ?? "",
    // <input type="date"> only understands yyyy-MM-dd, so an ISO timestamp has
    // to be trimmed or the field renders empty.
    expiredDate: start.expiredDate ? start.expiredDate.slice(0, 10) : "",
    locationType: start.locationType ?? "",
    branchName: start.branchName ?? "",
    description: start.description ?? "",
  });
  const changes = diffProfile(profileOf(employee), toProfile(values));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  const isContract = isFixedTerm(values.employmentType as EmploymentType);
  const isBranch = values.locationType === "CABANG";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setErrors({});

    const body = { type: "PROFILE_UPDATE", employeeId: employee.id, ...toProfile(values) };
    const result = revise
      ? await reviseAndResubmit(revise.id, revise.version, body)
      : await createAndSubmit(body);

    if (result.ok) {
      onSubmitted(result.request);
      return;
    }

    setErrors(result.failure.fieldErrors ?? {});
    setError(result.failure.fieldErrors ? null : result.failure.message);
    setSaving(false);
  }

  return (
    <Card className="p-3.5">
      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        {/* Name, address and state on one line: three short facts do not need
            three rows, and the rows are what pushed the form off the screen. */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline pb-2">
          <h2 className="truncate text-base font-semibold text-ink">{employee.displayName}</h2>
          <p className="min-w-0 flex-1 truncate font-mono text-xs text-ink-muted">
            {employee.email}
          </p>
          <StatusBadge status={employee.status} />
        </div>

        <FormAlert tone="error">{error}</FormAlert>

        {locked ? (
          <FormAlert tone="info">
            {t.execution.profileLockedNote}
          </FormAlert>
        ) : null}

        {/*
         * One grid for every field rather than one per pair.
         *
         * It used to be five grids stacked, each two columns wide with a third
         * left empty, so nine fields took six rows and the page scrolled past
         * its own save button. One grid lets the fields flow — three across on
         * a wide screen — and the whole profile fits on a screen.
         *
         * The three name fields are not here, and not because they were in the
         * way: a person does not change their name, and an edit screen that
         * offers to rename somebody offers a typo the chance to travel through
         * two approvals into the directory. A genuine change — a marriage, a
         * correction — is rare enough to be worth a conversation, and the name
         * is still carried through the values below unchanged, so the diff
         * approvers read never says the name was cleared.
         */}
        <fieldset
          disabled={locked || saving}
          className="grid gap-x-4 gap-y-2.5 disabled:opacity-60 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Field
            label={t.forms.jobTitle}
            name="jobTitle"
            icon={<IconBriefcase className="size-4" />}
            value={values.jobTitle}
            onChange={(event) => update("jobTitle", event.target.value)}
            error={errors.jobTitle}
            required
          />
          <Field
            label={t.forms.department}
            name="department"
            icon={<IconBuilding className="size-4" />}
            value={values.department}
            onChange={(event) => update("department", event.target.value)}
            error={errors.department}
            hint={t.editProfile.departmentHint}
            required
          />
          <SelectField
            label={t.forms.employmentType}
            name="employmentType"
            value={values.employmentType}
            onChange={(event) => update("employmentType", event.target.value)}
            error={errors.employmentType}
            hint={t.forms.employmentCodeHint}
          >
            <option value="">{t.editProfile.notSet}</option>
            {EMPLOYMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {employmentLabel(t, type)}
              </option>
            ))}
          </SelectField>

          {isContract ? (
            <Field
              label={t.forms.contractEnd}
              name="expiredDate"
              type="date"
              {...dateInputBounds(DATE_BOUNDS.contractEnd)}
              value={values.expiredDate}
              onChange={(event) => update("expiredDate", event.target.value)}
              error={errors.expiredDate}
              required
            />
          ) : null}

          <SelectField
            label={t.forms.location}
            name="locationType"
            value={values.locationType}
            onChange={(event) => update("locationType", event.target.value)}
            error={errors.locationType}
          >
            <option value="">{t.editProfile.notSet}</option>
            <option value="PUSAT">{t.editProfile.headOffice}</option>
            <option value="CABANG">{t.editProfile.branch}</option>
          </SelectField>

          {isBranch ? (
            <Field
              label={t.forms.branchName}
              name="branchName"
              value={values.branchName}
              onChange={(event) => update("branchName", event.target.value)}
              error={errors.branchName}
              placeholder="Cabang Surabaya"
              required
            />
          ) : null}
        </fieldset>

        {/*
         * The diff appears when there is one.
         *
         * It used to hold a bordered box saying "no changes yet" — a row and a
         * half of screen, on every visit, to report that nothing had happened.
         * The submit button is disabled in that state and the footer says why,
         * which is the same fact in space the form was using anyway.
         */}
        {changes.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
              {t.editProfile.changesTitle}
            </p>
            {/* Bounded, so a revision with a long diff still shows its own
                submit button without scrolling the page. */}
            <div className="max-h-52 overflow-auto rounded-xl border border-hairline">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-elevated/40 text-xs tracking-wide text-ink-faint uppercase">
                    <th className="px-3 py-1.5 font-medium">{t.summary.field}</th>
                    <th className="px-3 py-1.5 font-medium">{t.forms.now}</th>
                    <th className="px-3 py-1.5 font-medium">{t.forms.becomes}</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((change) => (
                    <tr key={change.field} className="border-b border-hairline/60 last:border-0">
                      <td className="px-3 py-1.5 text-ink-muted">{change.label}</td>
                      <td className="px-3 py-1.5 break-words text-ink-muted line-through decoration-ink-faint/60">
                        {change.from}
                      </td>
                      <td className="px-3 py-1.5 font-medium break-words text-accent">
                        {change.to}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {/* One footer row: the button, and everything worth saying beside it. */}
        <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-3">
          <Button type="submit" loading={saving} disabled={locked || changes.length === 0}>
            {saving ? t.forms.submitting : revise ? t.forms.submitRevision : t.editProfile.submit}
          </Button>
          <p className="min-w-0 flex-1 text-xs leading-snug text-ink-muted">
            {changes.length === 0 ? `${t.editProfile.noChanges} ` : ""}
            {t.editProfile.afterSubmit} {t.editProfile.emailManagerLocked}
            {revise ? null : (
              <>
                {" "}
                <Link href="/pengajuan" className="text-accent hover:underline">
                  {t.editProfile.seeRequests}
                </Link>
                .
              </>
            )}
          </p>
        </div>
      </form>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* One form for everything                                                    */
/* -------------------------------------------------------------------------- */

/** What the submit button says, per request the edits add up to. */
const SUBMIT_LABEL: Record<
  Exclude<EditIntent, "NONE" | "MIXED">,
  "submitProfile" | "submitMovement" | "submitTermination"
> = {
  PROFILE_UPDATE: "submitProfile",
  MOVEMENT: "submitMovement",
  TERMINATION: "submitTermination",
};

/**
 * Everything that can be asked about one employee, on one screen.
 *
 * There is no "what do you want to do" step. You change what is true about
 * somebody — their division, their employment, or the day they leave — and the
 * request that gets raised follows from that (lifecycle/editIntent.ts). The
 * submit button says which one it will be before it is pressed, so the
 * derivation is never a surprise.
 *
 * The three separate forms this replaces still exist and are still used: the
 * revision screen has no roster and no diff to derive from, so it goes on
 * showing the one form that matches the request being revised.
 */
export function EmployeeEditForm({
  employee,
  employeeOptions,
  onPick,
  managerCandidates,
  locked,
  onSubmitted,
}: {
  employee: Employee;
  /** The whole roster, as the header picker offers it. */
  employeeOptions: ChoiceGroup[];
  onPick: (employeeId: string) => void;
  /** The roster a new manager is picked from. Everybody, not just this person. */
  managerCandidates: Employee[];
  locked: boolean;
  onSubmitted: (request: LifecycleRequest) => void;
}) {
  const t = useT();
  const start = profileOf(employee);

  const [values, setValues] = useState({
    jobTitle: start.jobTitle,
    department: start.department,
    managerName: employee.managerName,
    managerEmail: employee.managerEmail,
    employmentType: start.employmentType ?? "",
    // <input type="date"> only understands yyyy-MM-dd, so an ISO timestamp has
    // to be trimmed or the field renders empty.
    expiredDate: start.expiredDate ? start.expiredDate.slice(0, 10) : "",
    locationType: start.locationType ?? "",
    branchName: start.branchName ?? "",
    /** Empty unless this account is being closed. */
    lastWorkingDate: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  const intent = editIntent(employee, values);
  const isContract = isFixedTerm(values.employmentType as EmploymentType);
  const isBranch = values.locationType === "CABANG";

  /**
   * What the approvers will be shown, as this screen understands it.
   *
   * Built per request kind rather than from one diff: a Movement and a profile
   * update change different things, and a preview that listed both would be
   * describing a request nobody is about to raise.
   */
  const preview: Array<[string, string, string]> =
    intent === "TERMINATION"
      ? [[t.forms.lastWorkingDate, "—", values.lastWorkingDate]]
      : intent === "MOVEMENT"
        ? (
            [
              [t.forms.department, employee.department, values.department],
              [t.forms.jobTitle, employee.jobTitle, values.jobTitle],
              [t.forms.manager, employee.managerName, values.managerName],
            ] as Array<[string, string, string]>
          ).filter(([, before, after]) => after.trim() !== before.trim())
        : intent === "PROFILE_UPDATE"
          ? diffProfile(start, toProfile({ ...values, ...namesOf(employee) })).map(
              (change) => [change.label, change.from, change.to] as [string, string, string],
            )
          : [];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (intent === "NONE" || intent === "MIXED") return;

    setSaving(true);
    setError(null);
    setErrors({});

    const body =
      intent === "TERMINATION"
        ? {
            type: "TERMINATION",
            employeeId: employee.id,
            lastWorkingDate: values.lastWorkingDate,
          }
        : intent === "MOVEMENT"
          ? {
              type: "MOVEMENT",
              employeeId: employee.id,
              toDepartment: values.department,
              toJobTitle: values.jobTitle,
              toManagerName: values.managerName,
              toManagerEmail: values.managerEmail,
            }
          : {
              type: "PROFILE_UPDATE",
              employeeId: employee.id,
              ...toProfile({ ...values, ...namesOf(employee) }),
            };

    const result = await createAndSubmit(body);
    if (result.ok) {
      onSubmitted(result.request);
      return;
    }

    setErrors(result.failure.fieldErrors ?? {});
    setError(result.failure.fieldErrors ? null : result.failure.message);
    setSaving(false);
  }

  return (
    <Card className="p-3.5">
      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        {/*
         * Who is being edited, and the control that changes it, on one line.
         *
         * The picker IS the heading: it shows the name it would otherwise
         * repeat, and searching the roster no longer costs a column beside
         * the form. The address and the account state sit beside it because
         * three short facts do not need three rows.
         */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline pb-2">
          <ChoiceField
            label={t.forms.employee}
            name="employeeId"
            value={employee.id}
            onChange={onPick}
            groups={employeeOptions}
            icon={<IconUser className="size-4" />}
            className="w-full sm:w-72 [&>label]:sr-only"
          />
          <p className="min-w-0 flex-1 truncate font-mono text-xs text-ink-muted">
            {employee.email}
          </p>
          <StatusBadge status={employee.status} />
        </div>

        <FormAlert tone="error">{error}</FormAlert>

        {locked ? <FormAlert tone="info">{t.execution.profileLockedNote}</FormAlert> : null}

        <fieldset
          disabled={locked || saving}
          className="grid gap-x-4 gap-y-2.5 disabled:opacity-60 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Field
            label={t.forms.jobTitle}
            name="jobTitle"
            icon={<IconBriefcase className="size-4" />}
            value={values.jobTitle}
            onChange={(event) => update("jobTitle", event.target.value)}
            error={errors.toJobTitle ?? errors.jobTitle}
            required
          />
          <Field
            label={t.forms.department}
            name="department"
            icon={<IconBuilding className="size-4" />}
            value={values.department}
            onChange={(event) => update("department", event.target.value)}
            error={errors.toDepartment ?? errors.department}
            required
          />

          {/* The manager is editable here, and that is the whole reason a
              division change is a Movement: it changes who approves the next
              thing this person asks for. */}
          <ManagerPicker
            employees={managerCandidates}
            value={{ managerName: values.managerName, managerEmail: values.managerEmail }}
            onChange={(next) =>
              setValues((current) => ({
                ...current,
                managerName: next.managerName,
                managerEmail: next.managerEmail,
              }))
            }
            nameError={errors.toManagerName}
            emailError={errors.toManagerEmail}
          />

          <SelectField
            label={t.forms.employmentType}
            name="employmentType"
            value={values.employmentType}
            onChange={(event) => update("employmentType", event.target.value)}
            error={errors.employmentType}
            hint={t.forms.employmentCodeHint}
          >
            <option value="">{t.editProfile.notSet}</option>
            {EMPLOYMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {employmentLabel(t, type)}
              </option>
            ))}
          </SelectField>

          {isContract ? (
            <Field
              label={t.forms.contractEnd}
              name="expiredDate"
              type="date"
              {...dateInputBounds(DATE_BOUNDS.contractEnd)}
              value={values.expiredDate}
              onChange={(event) => update("expiredDate", event.target.value)}
              error={errors.expiredDate}
              required
            />
          ) : null}

          <SelectField
            label={t.forms.location}
            name="locationType"
            value={values.locationType}
            onChange={(event) => update("locationType", event.target.value)}
            error={errors.locationType}
          >
            <option value="">{t.editProfile.notSet}</option>
            <option value="PUSAT">{t.editProfile.headOffice}</option>
            <option value="CABANG">{t.editProfile.branch}</option>
          </SelectField>

          {isBranch ? (
            <Field
              label={t.forms.branchName}
              name="branchName"
              value={values.branchName}
              onChange={(event) => update("branchName", event.target.value)}
              error={errors.branchName}
              placeholder="Cabang Surabaya"
              required
            />
          ) : null}
        </fieldset>

        {/*
         * Closing the account, kept visually apart from the rest.
         *
         * One field, and filling it is the whole decision — so it sits in its
         * own bordered block rather than among the others, where a stray click
         * on a date picker could end somebody's access.
         */}
        <fieldset
          disabled={locked || saving}
          className="grid gap-x-4 gap-y-1 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 disabled:opacity-60 sm:grid-cols-[14rem_1fr] sm:items-center"
        >
          <Field
            label={t.forms.lastWorkingDate}
            name="lastWorkingDate"
            type="date"
            {...dateInputBounds(DATE_BOUNDS.lastWorkingDate)}
            value={values.lastWorkingDate}
            onChange={(event) => update("lastWorkingDate", event.target.value)}
            error={errors.lastWorkingDate}
          />
          <p className="text-xs leading-snug text-ink-muted">{t.editProfile.deactivateNote}</p>
        </fieldset>

        {intent === "MIXED" ? (
          <FormAlert tone="warn">{t.editProfile.mixedNote}</FormAlert>
        ) : null}

        {preview.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-hairline">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-hairline bg-elevated/40 text-xs tracking-wide text-ink-faint uppercase">
                  <th className="px-3 py-1 font-medium">{t.summary.field}</th>
                  <th className="px-3 py-1 font-medium">{t.forms.now}</th>
                  <th className="px-3 py-1 font-medium">{t.forms.becomes}</th>
                </tr>
              </thead>
              <tbody>
                {preview.map(([label, before, after]) => (
                  <tr key={label} className="border-b border-hairline/60 last:border-0">
                    <td className="px-3 py-1 text-ink-muted">{label}</td>
                    <td className="px-3 py-1 break-words text-ink-muted line-through decoration-ink-faint/60">
                      {before}
                    </td>
                    <td className="px-3 py-1 font-medium break-words text-accent">{after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-3">
          <Button
            type="submit"
            variant={intent === "TERMINATION" ? "danger" : "primary"}
            loading={saving}
            disabled={locked || intent === "NONE" || intent === "MIXED"}
          >
            {saving
              ? t.forms.submitting
              : intent === "NONE" || intent === "MIXED"
                ? t.editProfile.submit
                : t.editProfile[SUBMIT_LABEL[intent]]}
          </Button>
          <p className="min-w-0 flex-1 text-xs leading-snug text-ink-muted">
            {intent === "NONE" ? `${t.editProfile.noChanges} ` : ""}
            {t.editProfile.afterSubmit} {t.editProfile.emailManagerLocked}{" "}
            <Link href="/pengajuan" className="text-accent hover:underline">
              {t.editProfile.seeRequests}
            </Link>
            .
          </p>
        </div>
      </form>
    </Card>
  );
}

/** The name fields, carried through untouched — nobody is renamed here. */
function namesOf(employee: Employee): Pick<
  Record<string, string>,
  "firstName" | "lastName" | "displayName"
> {
  return {
    firstName: employee.firstName,
    lastName: employee.lastName,
    displayName: employee.displayName,
  };
}
