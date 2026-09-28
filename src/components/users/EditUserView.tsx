"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { RequestSubmitted } from "@/components/lifecycle/RequestSubmitted";
import { createAndSubmit, reviseAndResubmit } from "@/components/lifecycle/submitRequest";
import { FormAlert } from "@/components/ui/FormAlert";
import { Button } from "@/components/ui/Button";
import { Card, Field, SelectField, TextareaField } from "@/components/ui/Field";
import { IconBriefcase, IconBuilding, IconNote, IconSearch, IconUser } from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { diffProfile, profileOf } from "@/lib/lifecycle/profileUpdate";
import type { LifecycleRequest, ProfileFields } from "@/lib/lifecycle/types";
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
}: {
  employees: Employee[];
  /**
   * Employees with a lifecycle request in flight. Their profile is locked: a
   * request in progress owns the fields it proposes to change, and editing them
   * underneath it would make the approved payload disagree with the record it
   * was raised from.
   */
  pendingIds?: string[];
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(employees[0]?.id ?? null);
  // The roster itself never changes here: nothing is written until the request
  // is approved and executed. What changes is who now has a request in flight.
  const [pending, setPending] = useState<string[]>(pendingIds);
  const [submitted, setSubmitted] = useState<LifecycleRequest | null>(null);

  const selected = employees.find((employee) => employee.id === selectedId);

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

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <Card className="h-fit p-4">
        <Field
          label="Cari karyawan"
          name="employeeSearch"
          type="search"
          icon={<IconSearch className="size-4" />}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nama, email, departemen…"
        />

        <ul className="mt-3 max-h-[28rem] space-y-1 overflow-y-auto pr-1">
          {matches.map((employee) => {
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
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
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
          <p className="py-6 text-center text-sm text-ink-muted">Tidak ada yang cocok.</p>
        ) : null}
      </Card>

      {submitted ? (
        <RequestSubmitted request={submitted} onRaiseAnother={() => setSubmitted(null)} />
      ) : selected ? (
        <ProfileForm
          key={selected.id}
          employee={selected}
          locked={pending.includes(selected.id)}
          onSubmitted={(request) => {
            setPending((current) => [...current, selected.id]);
            setSubmitted(request);
          }}
        />
      ) : (
        <Card className="grid place-items-center p-10">
          <p className="text-sm text-ink-muted">Pilih karyawan di sebelah kiri untuk mengedit.</p>
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
    expiredDate: employmentType === "CONTRACT" ? trimmed("expiredDate") : undefined,
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
  const start: ProfileFields =
    revise?.payload.kind === "PROFILE_UPDATE" ? revise.payload.profile : profileOf(employee);

  const [values, setValues] = useState({
    firstName: start.firstName,
    lastName: start.lastName,
    displayName: start.displayName,
    jobTitle: start.jobTitle,
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

  const isContract = values.employmentType === "CONTRACT";
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
    <Card className="p-6">
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline pb-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-ink">{employee.displayName}</h2>
            <p className="truncate font-mono text-xs text-ink-muted">{employee.email}</p>
          </div>
          <StatusBadge status={employee.status} />
        </div>

        <FormAlert tone="error">{error}</FormAlert>

        {locked ? (
          <FormAlert tone="info">
            Karyawan ini sedang punya pengajuan yang berjalan, jadi profilnya dikunci sampai
            pengajuan itu selesai atau dibatalkan. Untuk mengubah isinya, revisi pengajuan tersebut
            dari halaman detailnya.
          </FormAlert>
        ) : null}

        <fieldset disabled={locked || saving} className="space-y-6 disabled:opacity-60">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Nama depan"
              name="firstName"
              icon={<IconUser className="size-4" />}
              value={values.firstName}
              onChange={(event) => update("firstName", event.target.value)}
              error={errors.firstName}
              required
            />
            <Field
              label="Nama belakang"
              name="lastName"
              value={values.lastName}
              onChange={(event) => update("lastName", event.target.value)}
              error={errors.lastName}
              required
            />
          </div>

          <Field
            label="Nama lengkap"
            name="displayName"
            value={values.displayName}
            onChange={(event) => update("displayName", event.target.value)}
            error={errors.displayName}
            hint="Nama yang tampil di seluruh dashboard dan email persetujuan."
            required
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Jabatan"
              name="jobTitle"
              icon={<IconBriefcase className="size-4" />}
              value={values.jobTitle}
              onChange={(event) => update("jobTitle", event.target.value)}
              error={errors.jobTitle}
              required
            />
            <Field
              label="Departemen"
              name="department"
              icon={<IconBuilding className="size-4" />}
              value={values.department}
              onChange={(event) => update("department", event.target.value)}
              error={errors.department}
              hint="Hanya mengubah nama divisi di profil — manager dan hak akses (group) tetap. Untuk pindah divisi lengkap dengan akses baru, gunakan Movement."
              required
            />
          </div>

          <TextareaField
            label="Keterangan jabatan"
            name="jobDescription"
            icon={<IconNote className="size-4" />}
            rows={3}
            value={values.jobDescription}
            onChange={(event) => update("jobDescription", event.target.value)}
            error={errors.jobDescription}
            placeholder="Ruang lingkup pekerjaan, tanggung jawab utama…"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Status kepegawaian"
              name="employmentType"
              value={values.employmentType}
              onChange={(event) => update("employmentType", event.target.value)}
              error={errors.employmentType}
            >
              <option value="">Belum ditentukan</option>
              <option value="PERMANENT">Karyawan Tetap</option>
              <option value="CONTRACT">Kontrak</option>
            </SelectField>

            {isContract ? (
              <Field
                label="Kontrak berakhir"
                name="expiredDate"
                type="date"
                {...dateInputBounds(DATE_BOUNDS.contractEnd)}
                value={values.expiredDate}
                onChange={(event) => update("expiredDate", event.target.value)}
                error={errors.expiredDate}
                required
              />
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Lokasi penempatan"
              name="locationType"
              value={values.locationType}
              onChange={(event) => update("locationType", event.target.value)}
              error={errors.locationType}
            >
              <option value="">Belum ditentukan</option>
              <option value="PUSAT">Pusat (Head Office)</option>
              <option value="CABANG">Cabang (Branch Office)</option>
            </SelectField>

            {isBranch ? (
              <Field
                label="Nama cabang"
                name="branchName"
                value={values.branchName}
                onChange={(event) => update("branchName", event.target.value)}
                error={errors.branchName}
                placeholder="Cabang Surabaya"
                required
              />
            ) : null}
          </div>

          <TextareaField
            label="Catatan HC"
            name="description"
            rows={3}
            value={values.description}
            onChange={(event) => update("description", event.target.value)}
            error={errors.description}
            placeholder="Catatan internal, opsional."
          />
        </fieldset>

        <div className="space-y-3">
          <p className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
            Perubahan yang akan diajukan
          </p>
          {changes.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-hairline">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-elevated/40 text-xs tracking-wide text-ink-faint uppercase">
                    <th className="px-3 py-2 font-medium">Isian</th>
                    <th className="px-3 py-2 font-medium">Sekarang</th>
                    <th className="px-3 py-2 font-medium">Menjadi</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((change) => (
                    <tr key={change.field} className="border-b border-hairline/60 last:border-0">
                      <td className="px-3 py-2 text-ink-muted">{change.label}</td>
                      <td className="px-3 py-2 break-words text-ink-muted line-through decoration-ink-faint/60">
                        {change.from}
                      </td>
                      <td className="px-3 py-2 font-medium break-words text-accent">{change.to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-lg border border-hairline bg-elevated/40 px-3.5 py-2.5 text-xs text-ink-muted">
              Belum ada perubahan. Ubah minimal satu isian untuk mengajukan.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
          <Button type="submit" loading={saving} disabled={locked || changes.length === 0}>
            {saving ? "Mengirim…" : revise ? "Kirim revisi ke approver" : "Ajukan perubahan"}
          </Button>
          <p className="min-w-0 flex-1 text-xs text-ink-muted">
            Profil belum berubah saat diajukan. Email persetujuan dikirim otomatis ke manager karyawan,
            lalu CISO; perubahan baru berlaku setelah keduanya menyetujui dan worker menjalankannya.
            Email dan manager tidak bisa diubah di sini.
          </p>
        </div>

        {revise ? null : (
          <p className="text-xs text-ink-faint">
            Semua pengajuan bisa dipantau di{" "}
            <Link href="/pengajuan" className="text-accent hover:underline">
              daftar pengajuan
            </Link>
            .
          </p>
        )}
      </form>
    </Card>
  );
}
