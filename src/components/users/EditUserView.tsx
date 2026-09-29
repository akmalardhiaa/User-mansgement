"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useT } from "@/components/i18n/LocaleProvider";
import { MovementForm } from "@/components/lifecycle/MovementForm";
import { RequestSubmitted } from "@/components/lifecycle/RequestSubmitted";
import { TerminationForm } from "@/components/lifecycle/TerminationForm";
import { createAndSubmit, reviseAndResubmit } from "@/components/lifecycle/submitRequest";
import { FormAlert } from "@/components/ui/FormAlert";
import { Button } from "@/components/ui/Button";
import { Card, Field, SelectField } from "@/components/ui/Field";
import {
  IconBriefcase,
  IconBuilding,
  IconPower,
  IconSearch,
  IconSwap,
  IconUser,
} from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { diffProfile, profileOf } from "@/lib/lifecycle/profileUpdate";
import { EMPLOYMENT_TYPES, isFixedTerm } from "@/lib/lifecycle/employment";
import { employmentOptionLabel } from "@/lib/i18n/labels";
import type { EmploymentType, LifecycleRequest, ProfileFields } from "@/lib/lifecycle/types";
import type { Employee } from "@/lib/types";
import { DATE_BOUNDS, dateInputBounds } from "@/lib/validation/dates";

/** How many names the roster shows before HC has searched for one. */
const VISIBLE_WITHOUT_SEARCH = 3;

/** The three things that can be asked for about somebody already on the roster. */
export type EditAction = "profile" | "movement" | "termination";

const ACTIONS: ReadonlyArray<{
  action: EditAction;
  label: "actionProfile" | "actionMovement" | "actionTermination";
  /** The same glyph the request type carries everywhere else in the portal. */
  icon: typeof IconUser;
}> = [
  { action: "profile", label: "actionProfile", icon: IconUser },
  { action: "movement", label: "actionMovement", icon: IconSwap },
  { action: "termination", label: "actionTermination", icon: IconPower },
];

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
  initialAction,
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
  /** Which action to open on, for links that arrive asking for one. */
  initialAction?: EditAction;
  /** Who to select on arrival, for the same links. */
  initialEmployeeId?: string;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialEmployeeId ?? employees[0]?.id ?? null,
  );
  const [action, setAction] = useState<EditAction>(initialAction ?? "profile");
  // The roster itself never changes here: nothing is written until the request
  // is approved and executed. What changes is who now has a request in flight.
  const [pending, setPending] = useState<string[]>(pendingIds);
  // Whether the roster is showing everybody rather than the short default list.
  const [showAll, setShowAll] = useState(false);
  const [submitted, setSubmitted] = useState<LifecycleRequest | null>(null);

  const selected = employees.find((employee) => employee.id === selectedId);
  const locked = selected ? pending.includes(selected.id) : false;

  /** One place to record that a request now exists for this person. */
  const raised = (request: LifecycleRequest) => {
    if (selected) setPending((current) => [...current, selected.id]);
    setSubmitted(request);
  };

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter((employee) =>
      [employee.displayName, employee.email, employee.department, employee.jobTitle]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [employees, query]);

  /*
   * Without a search, a handful of names — not the whole roster.
   *
   * A list of everybody is what made this column taller than the screen, and
   * scrolling through twenty names is slower than typing three letters. The
   * selected person is always among them, because a list that hides who you
   * are currently editing is worse than a short one.
   *
   * "Show everybody" is one click away and stays a click away: the short list
   * is a default, not a restriction, and somebody who wants to browse rather
   * than search should not have to invent a query to do it.
   */
  const listed = useMemo(() => {
    if (query.trim() || showAll) return matches;
    const head = matches.slice(0, VISIBLE_WITHOUT_SEARCH);
    if (!selectedId || head.some((employee) => employee.id === selectedId)) return head;
    const chosen = matches.find((employee) => employee.id === selectedId);
    return chosen ? [chosen, ...head.slice(0, VISIBLE_WITHOUT_SEARCH - 1)] : head;
  }, [matches, query, selectedId, showAll]);

  const hidden = matches.length - listed.length;

  return (
    <div className="grid gap-4 lg:grid-cols-[13.5rem_1fr] 2xl:grid-cols-[17rem_1fr]">
      {/* Sticky, and never taller than the screen — see `listed` above. */}
      <Card className="flex h-fit flex-col p-3 lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100vh-14rem)]">
        <Field
          label={t.editProfile.searchEmployee}
          name="employeeSearch"
          type="search"
          icon={<IconSearch className="size-4" />}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.editProfile.searchPlaceholder}
        />

        <ul className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
          {listed.map((employee) => {
            const active = employee.id === selectedId;
            return (
              <li key={employee.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(employee.id);
                    setSubmitted(null);
                  }}
                  aria-current={active || undefined}
                  className={`w-full rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                    active
                      ? "border-accent/50 bg-accent/10"
                      : "border-transparent hover:border-hairline hover:bg-elevated/50"
                  }`}
                >
                  <p className="truncate text-sm font-medium text-ink">{employee.displayName}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {employee.department}
                    {pending.includes(employee.id) ? " · dalam pengajuan" : ""}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>

        {matches.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">{t.editProfile.noMatch}</p>
        ) : hidden > 0 ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-1.5 w-full rounded-lg px-2.5 py-1.5 text-left text-xs leading-snug text-accent transition-colors hover:bg-elevated/50"
          >
            {t.editProfile.showAll.replace("{count}", String(matches.length))}
          </button>
        ) : showAll && !query.trim() ? (
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="mt-1.5 w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-ink-faint transition-colors hover:bg-elevated/50 hover:text-ink"
          >
            {t.editProfile.showFewer}
          </button>
        ) : null}
      </Card>

      {submitted ? (
        <RequestSubmitted request={submitted} onRaiseAnother={() => setSubmitted(null)} />
      ) : selected ? (
        <div className="space-y-3">
          {/*
           * The three things that can be asked for about somebody who already
           * has a record. They used to live on two different pages — a profile
           * change here, a Movement and a Termination on the new-request page,
           * each with its own employee picker — so doing two of them to one
           * person meant choosing that person twice.
           */}
          <div
            role="tablist"
            aria-label={t.editProfile.actionsLabel}
            className="flex flex-wrap gap-1.5"
          >
            {ACTIONS.map((item) => {
              const current = action === item.action;
              const Glyph = item.icon;
              return (
                <button
                  key={item.action}
                  type="button"
                  role="tab"
                  aria-selected={current}
                  onClick={() => setAction(item.action)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    current
                      ? "border-accent/50 bg-accent/10 text-ink"
                      : "border-hairline text-ink-muted hover:border-hairline-strong hover:text-ink"
                  }`}
                >
                  <Glyph className={`size-4 ${current ? "text-accent" : "text-ink-faint"}`} />
                  {t.editProfile[item.label]}
                </button>
              );
            })}
          </div>

          {locked ? (
            <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs leading-snug text-warn">
              {t.editProfile.lockedNote}
            </p>
          ) : null}

          {action === "profile" ? (
            <ProfileForm
              key={`profile-${selected.id}`}
              employee={selected}
              locked={locked}
              onSubmitted={raised}
            />
          ) : null}
          {/*
           * Neither form asks who again. The roster beside them is the answer,
           * and a dropdown holding exactly one option is the same question
           * twice. When the person is locked the forms are handed an empty
           * roster, and then the picker has to come back to say so.
           */}
          {action === "movement" ? (
            <MovementForm
              key={`movement-${selected.id}`}
              employees={locked ? [] : [selected]}
              managerCandidates={employees}
              initialEmployeeId={selected.id}
              subjectChosenElsewhere={!locked}
              onSubmitted={raised}
            />
          ) : null}
          {action === "termination" ? (
            <TerminationForm
              key={`termination-${selected.id}`}
              employees={locked ? [] : [selected]}
              initialEmployeeId={selected.id}
              subjectChosenElsewhere={!locked}
              onSubmitted={raised}
            />
          ) : null}
        </div>
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
         */}
        <fieldset
          disabled={locked || saving}
          className="grid gap-x-4 gap-y-2.5 disabled:opacity-60 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Field
            label={t.forms.firstName}
            name="firstName"
            icon={<IconUser className="size-4" />}
            value={values.firstName}
            onChange={(event) => update("firstName", event.target.value)}
            error={errors.firstName}
            required
          />
          <Field
            label={t.forms.lastName}
            name="lastName"
            value={values.lastName}
            onChange={(event) => update("lastName", event.target.value)}
            error={errors.lastName}
            required
          />
          <Field
            label={t.forms.fullName}
            name="displayName"
            value={values.displayName}
            onChange={(event) => update("displayName", event.target.value)}
            error={errors.displayName}
            hint={t.editProfile.displayNameHint}
            required
          />
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
                {employmentOptionLabel(t, type)}
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
