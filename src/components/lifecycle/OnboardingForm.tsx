"use client";

import { useRef, useState } from "react";

import { createAndSubmit, reviseAndResubmit } from "@/components/lifecycle/submitRequest";
import { Button } from "@/components/ui/Button";
import { Card, Field, SelectField, TextareaField } from "@/components/ui/Field";
import { FormAlert } from "@/components/ui/FormAlert";
import {
  IconApprovals,
  IconBriefcase,
  IconBuilding,
  IconClock,
  IconIdCard,
  IconMail,
  IconNote,
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

const EMPTY = {
  nik: "",
  firstName: "",
  lastName: "",
  displayName: "",
  email: "",
  jobTitle: "",
  jobDescription: "",
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
    nik: payload.nik,
    firstName: payload.firstName,
    lastName: payload.lastName,
    displayName: payload.displayName,
    email: payload.email,
    jobTitle: payload.jobTitle,
    jobDescription: payload.jobDescription ?? "",
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
  const [values, setValues] = useState(() => fromRequest(revise));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // When revising, the name was already written by hand — stop it following.
  const nameEdited = useRef(Boolean(revise));

  function update(field: keyof typeof EMPTY, value: string) {
    setValues((current) => {
      const next = { ...current, [field]: value };
      // The full name follows first/last until HC edits it directly.
      if ((field === "firstName" || field === "lastName") && !nameEdited.current) {
        next.displayName = `${next.firstName} ${next.lastName}`.trim();
      }
      if (field === "displayName") nameEdited.current = value.trim().length > 0;
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
      // Empty strings would fail date validation. There is no effective date for
      // an onboarding: the account is made as soon as both approvals are in.
      expiredDate: values.employmentType === "CONTRACT" ? values.expiredDate : undefined,
      branchName: values.locationType === "CABANG" ? values.branchName : undefined,
      jobDescription: values.jobDescription || undefined,
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
            Identitas karyawan
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="NIK"
              name="nik"
              icon={<IconIdCard className="size-4" />}
              value={values.nik}
              onChange={(event) => update("nik", event.target.value)}
              error={fieldErrors.nik}
              placeholder="2026001"
              hint="Nomor induk karyawan, dipakai sebagai kunci identitas."
            />
            <Field
              label="Email"
              name="email"
              type="email"
              icon={<IconMail className="size-4" />}
              value={values.email}
              onChange={(event) => update("email", event.target.value)}
              error={fieldErrors.email}
              placeholder="nadia.kusuma@example.com"
            />
            <Field
              label="Nama depan"
              name="firstName"
              icon={<IconUser className="size-4" />}
              value={values.firstName}
              onChange={(event) => update("firstName", event.target.value)}
              error={fieldErrors.firstName}
              placeholder="Nadia"
            />
            <Field
              label="Nama belakang"
              name="lastName"
              icon={<IconUser className="size-4" />}
              value={values.lastName}
              onChange={(event) => update("lastName", event.target.value)}
              error={fieldErrors.lastName}
              placeholder="Kusuma"
            />
            <Field
              label="Nama lengkap"
              name="displayName"
              icon={<IconIdCard className="size-4" />}
              value={values.displayName}
              onChange={(event) => update("displayName", event.target.value)}
              error={fieldErrors.displayName}
              hint="Terisi otomatis dari nama depan dan belakang; bisa diubah."
              className="sm:col-span-2"
            />
          </div>
        </div>

        <div>
          <p className={SECTION}>
            <IconBriefcase className="size-3.5" />
            Penempatan
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <ComboField
              label="Jabatan"
              name="jobTitle"
              groups={JOB_TITLE_GROUPS}
              icon={<IconBriefcase className="size-4" />}
              value={values.jobTitle}
              onChange={(next) => update("jobTitle", next)}
              error={fieldErrors.jobTitle}
              placeholder="Backend Engineer"
              hint="Pilih dari daftar, atau ketik jabatan baru."
            />
            <ComboField
              label="Departemen"
              name="department"
              groups={DEPARTMENT_GROUPS}
              icon={<IconBuilding className="size-4" />}
              value={values.department}
              onChange={(next) => update("department", next)}
              error={fieldErrors.department}
              hint="Pilih dari daftar, atau ketik divisi baru."
            />

            <SelectField
              label="Status kepegawaian"
              name="employmentType"
              value={values.employmentType}
              onChange={(event) => update("employmentType", event.target.value)}
              error={fieldErrors.employmentType}
            >
              <option value="PERMANENT">Karyawan tetap</option>
              <option value="CONTRACT">Kontrak</option>
            </SelectField>

            {values.employmentType === "CONTRACT" ? (
              <Field
                label="Kontrak berakhir"
                name="expiredDate"
                type="date"
                {...dateInputBounds(DATE_BOUNDS.newContractEnd)}
                value={values.expiredDate}
                onChange={(event) => update("expiredDate", event.target.value)}
                error={fieldErrors.expiredDate}
                hint="Kontrak tanpa tanggal berakhir terbaca sebagai permanen."
              />
            ) : null}

            <SelectField
              label="Lokasi penempatan"
              name="locationType"
              value={values.locationType}
              onChange={(event) => update("locationType", event.target.value)}
              error={fieldErrors.locationType}
            >
              <option value="PUSAT">Kantor pusat</option>
              <option value="CABANG">Kantor cabang</option>
            </SelectField>

            {values.locationType === "CABANG" ? (
              <Field
                label="Nama cabang"
                name="branchName"
                icon={<IconBuilding className="size-4" />}
                value={values.branchName}
                onChange={(event) => update("branchName", event.target.value)}
                error={fieldErrors.branchName}
                placeholder="Cabang Surabaya"
              />
            ) : null}

            <Field
              label="Tanggal mulai bekerja"
              name="startDate"
              type="date"
              {...dateInputBounds(DATE_BOUNDS.startDate)}
              icon={<IconClock className="size-4" />}
              value={values.startDate}
              onChange={(event) => update("startDate", event.target.value)}
              error={fieldErrors.startDate}
              hint="Dicatat sebagai hari pertama kerja. Akun langsung dibuat begitu kedua persetujuan masuk, apa pun tanggalnya."
            />

            <TextareaField
              label="Keterangan jabatan (opsional)"
              name="jobDescription"
              rows={2}
              icon={<IconNote className="size-4" />}
              value={values.jobDescription}
              onChange={(event) => update("jobDescription", event.target.value)}
              error={fieldErrors.jobDescription}
              className="sm:col-span-2"
            />
          </div>
        </div>

        <div>
          <p className={SECTION}>
            <IconApprovals className="size-3.5" />
            Atasan langsung dan profil akses
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
              label="Profil akses"
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
            {submitting ? "Mengirim…" : revise ? "Kirim revisi ke approver" : "Kirim ke approver"}
          </Button>
          <p className="text-xs text-ink-faint">
            Akun belum dibuat. Pengajuan dikirim ke manager, lalu CISO.
          </p>
        </div>
      </form>
    </Card>
  );
}
