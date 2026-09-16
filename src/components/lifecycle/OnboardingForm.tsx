"use client";

import { useRef, useState } from "react";

import { createAndSubmit } from "@/components/lifecycle/submitRequest";
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
import { DEPARTMENTS } from "@/lib/db/seed";
import type { Employee } from "@/lib/types";

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
  effectiveAt: "",
};

/**
 * Asking for an account to be created.
 *
 * Note what HC is never asked for: a password, an OU, a group name, or a
 * distinguished name. Access is picked as a catalogue profile and resolved to
 * directory objects server-side, by people who review that mapping — which is
 * the difference between choosing a role and writing one.
 */
export function OnboardingForm({
  employees,
  onSubmitted,
}: {
  employees: Employee[];
  onSubmitted: (request: LifecycleRequest) => void;
}) {
  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const nameEdited = useRef(false);

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

    const result = await createAndSubmit({
      type: "ONBOARDING",
      ...values,
      // Empty strings would fail date validation; absent means "as soon as it
      // is approved", which is the ordinary case.
      expiredDate: values.employmentType === "CONTRACT" ? values.expiredDate : undefined,
      branchName: values.locationType === "CABANG" ? values.branchName : undefined,
      effectiveAt: values.effectiveAt || undefined,
      jobDescription: values.jobDescription || undefined,
    });

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
            <Field
              label="Jabatan"
              name="jobTitle"
              icon={<IconBriefcase className="size-4" />}
              value={values.jobTitle}
              onChange={(event) => update("jobTitle", event.target.value)}
              error={fieldErrors.jobTitle}
              placeholder="Backend Engineer"
            />
            <Field
              label="Departemen"
              name="department"
              list="onboarding-departments"
              icon={<IconBuilding className="size-4" />}
              value={values.department}
              onChange={(event) => update("department", event.target.value)}
              error={fieldErrors.department}
              hint="Pilih dari daftar, atau ketik divisi baru."
            />
            <datalist id="onboarding-departments">
              {DEPARTMENTS.map((department) => (
                <option key={department} value={department} />
              ))}
            </datalist>

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
              icon={<IconClock className="size-4" />}
              value={values.startDate}
              onChange={(event) => update("startDate", event.target.value)}
              error={fieldErrors.startDate}
            />
            <Field
              label="Waktu efektif (opsional)"
              name="effectiveAt"
              type="date"
              icon={<IconClock className="size-4" />}
              value={values.effectiveAt}
              onChange={(event) => update("effectiveAt", event.target.value)}
              error={fieldErrors.effectiveAt}
              hint="Kosongkan agar dijalankan segera setelah kedua approval masuk."
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
            {submitting ? "Mengirim…" : "Kirim ke approver"}
          </Button>
          <p className="text-xs text-ink-faint">
            Akun belum dibuat. Pengajuan dikirim ke manager, lalu CISO.
          </p>
        </div>
      </form>
    </Card>
  );
}
