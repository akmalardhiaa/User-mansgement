"use client";

import { useState } from "react";

import { createAndSubmit } from "@/components/lifecycle/submitRequest";
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
import { DEPARTMENTS } from "@/lib/db/seed";
import type { Employee } from "@/lib/types";

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
  onSubmitted,
}: {
  /** Already excludes anyone with a request in flight. */
  employees: Employee[];
  initialEmployeeId?: string;
  onSubmitted: (request: LifecycleRequest) => void;
}) {
  const [employeeId, setEmployeeId] = useState(initialEmployeeId ?? "");
  const [values, setValues] = useState({
    toDepartment: "",
    toJobTitle: "",
    toJobDescription: "",
    toManagerName: "",
    toManagerEmail: "",
    accessProfileId: "standard",
    reason: "",
    effectiveAt: "",
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

    const result = await createAndSubmit({
      type: "MOVEMENT",
      employeeId,
      ...values,
      toJobDescription: values.toJobDescription || undefined,
      effectiveAt: values.effectiveAt || undefined,
    });

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
        ["Departemen", employee.department, values.toDepartment || "—"],
        ["Jabatan", employee.jobTitle, values.toJobTitle || "—"],
        ["Manager", employee.managerName, values.toManagerName || "—"],
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
            label="Karyawan"
            name="employeeId"
            icon={<IconUser className="size-4" />}
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            error={fieldErrors.employeeId}
            hint="Karyawan yang sedang memiliki pengajuan berjalan tidak muncul di sini."
          >
            <option value="">Pilih karyawan…</option>
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
                    <th className="px-4 py-2.5 font-medium">Atribut</th>
                    <th className="px-4 py-2.5 font-medium">Sekarang</th>
                    <th className="px-4 py-2.5 font-medium">Menjadi</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.map(([label, before, after]) => {
                    const changed = after !== "—" && before !== after;
                    return (
                      <tr key={label} className="border-b border-hairline/60 last:border-0">
                        <td className="px-4 py-2.5 text-ink-muted">{label}</td>
                        <td className="px-4 py-2.5 text-ink-muted line-through decoration-ink-faint/60">
                          {before}
                        </td>
                        <td
                          className={`px-4 py-2.5 font-medium ${changed ? "text-accent" : "text-ink-faint"}`}
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
            <Field
              label="Departemen tujuan"
              name="toDepartment"
              list="movement-departments"
              icon={<IconBuilding className="size-4" />}
              value={values.toDepartment}
              onChange={(event) => update("toDepartment", event.target.value)}
              error={fieldErrors.toDepartment}
            />
            <datalist id="movement-departments">
              {DEPARTMENTS.map((department) => (
                <option key={department} value={department} />
              ))}
            </datalist>

            <Field
              label="Jabatan tujuan"
              name="toJobTitle"
              icon={<IconBriefcase className="size-4" />}
              value={values.toJobTitle}
              onChange={(event) => update("toJobTitle", event.target.value)}
              error={fieldErrors.toJobTitle}
              placeholder="Security Engineer"
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

            <SelectField
              label="Profil akses baru"
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
              label="Keterangan jabatan baru (opsional)"
              name="toJobDescription"
              rows={2}
              icon={<IconNote className="size-4" />}
              value={values.toJobDescription}
              onChange={(event) => update("toJobDescription", event.target.value)}
              error={fieldErrors.toJobDescription}
              className="sm:col-span-2"
            />

            <TextareaField
              label="Alasan pemindahan"
              name="reason"
              rows={2}
              icon={<IconNote className="size-4" />}
              value={values.reason}
              onChange={(event) => update("reason", event.target.value)}
              error={fieldErrors.reason}
              placeholder="Rotasi internal, pengisian posisi kosong, …"
              hint="Dibaca kedua approver."
              className="sm:col-span-2"
            />
          </div>
        </div>

        <div>
          <p className={SECTION}>Manager divisi tujuan</p>
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
            {submitting ? "Mengirim…" : "Kirim ke approver"}
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
