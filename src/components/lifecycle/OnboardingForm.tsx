"use client";

import { useRef, useState } from "react";

import { createAndSubmit, reviseAndResubmit } from "@/components/lifecycle/submitRequest";
import { useT } from "@/components/i18n/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { Card, Field, SelectField } from "@/components/ui/Field";
import { FormAlert } from "@/components/ui/FormAlert";
import {
  IconApprovals,
  IconBriefcase,
  IconBuilding,
  IconClock,
  IconIdCard,
  IconMail,
  IconUser,
} from "@/components/ui/Icons";
import { ManagerPicker } from "@/components/users/ManagerPicker";
import {
  COMPANY_EMAIL_DOMAINS,
  DEFAULT_EMAIL_DOMAIN,
  companyEmailLocalPart,
  splitCompanyEmail,
} from "@/lib/lifecycle/companyEmail";
import { EMPLOYMENT_TYPES, isFixedTerm } from "@/lib/lifecycle/employment";
import { employmentOptionLabel } from "@/lib/i18n/labels";
import { ACCESS_PROFILES } from "@/lib/lifecycle/accessProfiles";
import type { EmploymentType, LifecycleRequest } from "@/lib/lifecycle/types";
import { ComboField } from "@/components/ui/ComboField";
import { DEPARTMENT_GROUPS, JOB_TITLE_GROUPS } from "@/lib/db/seed";
import type { Employee } from "@/lib/types";
import { DATE_BOUNDS, dateInputBounds } from "@/lib/validation/dates";

const SECTION =
  "mb-4 flex items-center gap-2 text-xs font-medium tracking-[0.14em] text-ink-faint uppercase";

const EMPTY = {
  firstName: "",
  lastName: "",
  displayName: "",
  /** The address in the two halves the form shows; joined on submit. */
  emailLocal: "",
  emailDomain: DEFAULT_EMAIL_DOMAIN as string,
  jobTitle: "",
  department: "",
  employmentType: "PERMANENT",
  expiredDate: "",
  locationType: "PUSAT",
  branchName: "",
  managerName: "",
  managerEmail: "",
  startDate: "",
  accessProfileId: "standard",
};

/**
 * Asking for an account to be created.
 *
 * Note what HC is never asked for: a password, an OU, a group name, or a
 * distinguished name. Access is picked as a catalogue profile and resolved to
 * directory objects server-side, by people who review that mapping — which is
 * the difference between choosing a role and writing one.
 */
/** The form's starting values when revising: the proposal as it was sent. */
function fromRequest(request: LifecycleRequest | undefined): typeof EMPTY {
  if (request?.payload.kind !== "ONBOARDING") return EMPTY;
  const payload = request.payload;
  return {
    firstName: payload.firstName,
    lastName: payload.lastName,
    displayName: payload.displayName,
    emailLocal: splitCompanyEmail(payload.email).local,
    emailDomain: splitCompanyEmail(payload.email).domain,
    jobTitle: payload.jobTitle,
    department: payload.department,
    employmentType: payload.employmentType,
    expiredDate: payload.expiredDate?.slice(0, 10) ?? "",
    locationType: payload.locationType,
    branchName: payload.branchName ?? "",
    managerName: payload.managerName,
    managerEmail: payload.managerEmail,
    startDate: payload.startDate.slice(0, 10),
    accessProfileId: payload.accessProfileId,
  };
}

export function OnboardingForm({
  employees,
  revise,
  onSubmitted,
}: {
  employees: Employee[];
  /** The request being revised. Everything starts from what was sent. */
  revise?: LifecycleRequest;
  onSubmitted: (request: LifecycleRequest) => void;
}) {
  const t = useT();
  const [values, setValues] = useState(() => fromRequest(revise));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // When revising, the name was already written by hand — stop it following.
  const nameEdited = useRef(Boolean(revise));
  // Same rule for the address: a revision starts from one somebody chose.
  const emailEdited = useRef(Boolean(revise));

  function update(field: keyof typeof EMPTY, value: string) {
    setValues((current) => {
      const next = { ...current, [field]: value };
      // The full name follows first/last until HC edits it directly.
      if ((field === "firstName" || field === "lastName") && !nameEdited.current) {
        next.displayName = `${next.firstName} ${next.lastName}`.trim();
      }
      if (field === "displayName") nameEdited.current = value.trim().length > 0;

      /*
       * The address follows the name and the kind of employment, until HC
       * types one themselves. Changing somebody from permanent to temporary
       * before the address has been touched moves the digit with it, which is
       * the whole point of encoding it there.
       */
      if (
        !emailEdited.current &&
        (field === "firstName" || field === "lastName" || field === "employmentType")
      ) {
        next.emailLocal = companyEmailLocalPart(
          next.firstName,
          next.lastName,
          next.employmentType as EmploymentType,
        );
      }
      if (field === "emailLocal") emailEdited.current = value.trim().length > 0;
      return next;
    });
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
      type: "ONBOARDING",
      ...values,
      // The two halves are a form concern; the request carries one address.
      email: `${values.emailLocal.trim()}${values.emailDomain}`,
      // Empty strings would fail date validation. There is no effective date for
      // an onboarding: the account is made as soon as both approvals are in.
      expiredDate: isFixedTerm(values.employmentType as EmploymentType)
        ? values.expiredDate
        : undefined,
      branchName: values.locationType === "CABANG" ? values.branchName : undefined,
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
            {t.forms.sectionIdentity}
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label={t.forms.firstName}
              name="firstName"
              icon={<IconUser className="size-4" />}
              value={values.firstName}
              onChange={(event) => update("firstName", event.target.value)}
              error={fieldErrors.firstName}
              placeholder="Nadia"
            />
            <Field
              label={t.forms.lastName}
              name="lastName"
              icon={<IconUser className="size-4" />}
              value={values.lastName}
              onChange={(event) => update("lastName", event.target.value)}
              error={fieldErrors.lastName}
              placeholder="Kusuma"
            />
            <Field
              label={t.forms.fullName}
              name="displayName"
              icon={<IconIdCard className="size-4" />}
              value={values.displayName}
              onChange={(event) => update("displayName", event.target.value)}
              error={fieldErrors.displayName}
              hint={t.forms.fullNameHint}
              className="sm:col-span-2"
            />
            {/*
             * The address in two controls: the part HC may adjust, and the
             * domain they pick. Suggested from the name and the employment
             * digit — see lifecycle/companyEmail.ts — and editable, because a
             * second person with the same name needs the other digit of the
             * range and no rule can guess which.
             */}
            <div className="grid gap-3 sm:col-span-2 sm:grid-cols-[1fr_auto]">
              <Field
                label={t.forms.email}
                name="emailLocal"
                icon={<IconMail className="size-4" />}
                value={values.emailLocal}
                onChange={(event) => update("emailLocal", event.target.value)}
                error={fieldErrors.email}
                placeholder="nadiakusuma1"
                hint={t.forms.emailHint}
              />
              <SelectField
                label={t.forms.emailDomain}
                name="emailDomain"
                value={values.emailDomain}
                onChange={(event) => update("emailDomain", event.target.value)}
              >
                {COMPANY_EMAIL_DOMAINS.map((domain) => (
                  <option key={domain} value={domain}>
                    {domain}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>
        </div>

        <div>
          <p className={SECTION}>
            <IconBriefcase className="size-3.5" />
            {t.forms.sectionPlacement}
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <ComboField
              label={t.forms.jobTitle}
              name="jobTitle"
              groups={JOB_TITLE_GROUPS}
              icon={<IconBriefcase className="size-4" />}
              value={values.jobTitle}
              onChange={(next) => update("jobTitle", next)}
              error={fieldErrors.jobTitle}
              placeholder="Backend Engineer"
              hint={t.forms.jobTitleHint}
            />
            <ComboField
              label={t.forms.department}
              name="department"
              groups={DEPARTMENT_GROUPS}
              icon={<IconBuilding className="size-4" />}
              value={values.department}
              onChange={(next) => update("department", next)}
              error={fieldErrors.department}
              hint={t.forms.departmentHint}
            />

            <SelectField
              label={t.forms.employmentType}
              name="employmentType"
              value={values.employmentType}
              onChange={(event) => update("employmentType", event.target.value)}
              error={fieldErrors.employmentType}
              hint={t.forms.employmentCodeHint}
            >
              {EMPLOYMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {employmentOptionLabel(t, type)}
                </option>
              ))}
            </SelectField>

            {isFixedTerm(values.employmentType as EmploymentType) ? (
              <Field
                label={t.forms.contractEnd}
                name="expiredDate"
                type="date"
                {...dateInputBounds(DATE_BOUNDS.newContractEnd)}
                value={values.expiredDate}
                onChange={(event) => update("expiredDate", event.target.value)}
                error={fieldErrors.expiredDate}
                hint={t.forms.contractEndHint}
              />
            ) : null}

            <SelectField
              label={t.forms.location}
              name="locationType"
              value={values.locationType}
              onChange={(event) => update("locationType", event.target.value)}
              error={fieldErrors.locationType}
            >
              <option value="PUSAT">{t.forms.headOffice}</option>
              <option value="CABANG">{t.forms.branch}</option>
            </SelectField>

            {values.locationType === "CABANG" ? (
              <Field
                label={t.forms.branchName}
                name="branchName"
                icon={<IconBuilding className="size-4" />}
                value={values.branchName}
                onChange={(event) => update("branchName", event.target.value)}
                error={fieldErrors.branchName}
                placeholder="Cabang Surabaya"
              />
            ) : null}

            <Field
              label={t.forms.startDate}
              name="startDate"
              type="date"
              {...dateInputBounds(DATE_BOUNDS.startDate)}
              icon={<IconClock className="size-4" />}
              value={values.startDate}
              onChange={(event) => update("startDate", event.target.value)}
              error={fieldErrors.startDate}
              hint={t.forms.startDateHint}
            />

          </div>
        </div>

        <div>
          <p className={SECTION}>
            <IconApprovals className="size-3.5" />
            {t.forms.sectionManagerAccess}
          </p>

          <ManagerPicker
            employees={employees}
            value={{ managerName: values.managerName, managerEmail: values.managerEmail }}
            onChange={(next) =>
              setValues((current) => ({
                ...current,
                managerName: next.managerName,
                managerEmail: next.managerEmail,
              }))
            }
            nameError={fieldErrors.managerName}
            emailError={fieldErrors.managerEmail}
          />

          <div className="mt-5">
            <SelectField
              label={t.forms.accessProfile}
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
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
          <Button type="submit" loading={submitting}>
            {submitting ? t.forms.submitting : revise ? t.forms.submitRevision : t.forms.submit}
          </Button>
          <p className="text-xs text-ink-faint">
            Akun belum dibuat. Pengajuan dikirim ke manager, lalu CISO.
          </p>
        </div>
      </form>
    </Card>
  );
}
