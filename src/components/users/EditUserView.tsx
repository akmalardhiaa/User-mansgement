"use client";

import { useMemo, useState } from "react";

import { FormAlert } from "@/components/ui/FormAlert";
import { Button } from "@/components/ui/Button";
import { Card, Field, SelectField, TextareaField } from "@/components/ui/Field";
import { IconBriefcase, IconBuilding, IconNote, IconSearch, IconUser } from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { putJson } from "@/lib/client/accountsApi";
import type { Employee } from "@/lib/types";

/**
 * Edit an employee's profile.
 *
 * Only the fields that carry no access consequence are editable here. Email is
 * read-only because it is the key tying this record to its login account and
 * to every outstanding approval request; department changes that move
 * someone between divisions belong to the transfer flow, which is what puts
 * the manager in the loop. This form is for the parts nobody needs to approve:
 * a corrected spelling, a filled-in job description, a contract that became
 * permanent.
 */
export function EditUserView({ employees }: { employees: Employee[] }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(employees[0]?.id ?? null);
  const [roster, setRoster] = useState(employees);

  const selected = roster.find((employee) => employee.id === selectedId);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return roster;
    return roster.filter((employee) =>
      [employee.displayName, employee.email, employee.department, employee.jobTitle]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [roster, query]);

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
                  onClick={() => setSelectedId(employee.id)}
                  aria-current={active || undefined}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                    active
                      ? "border-accent/50 bg-accent/10"
                      : "border-transparent hover:border-hairline hover:bg-elevated/50"
                  }`}
                >
                  <p className="truncate text-sm font-medium text-ink">{employee.displayName}</p>
                  <p className="truncate text-xs text-ink-muted">{employee.department}</p>
                </button>
              </li>
            );
          })}
        </ul>

        {matches.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">Tidak ada yang cocok.</p>
        ) : null}
      </Card>

      {selected ? (
        <ProfileForm
          key={selected.id}
          employee={selected}
          onSaved={(updated) =>
            setRoster((current) =>
              current.map((employee) => (employee.id === updated.id ? updated : employee)),
            )
          }
        />
      ) : (
        <Card className="grid place-items-center p-10">
          <p className="text-sm text-ink-muted">Pilih karyawan di sebelah kiri untuk mengedit.</p>
        </Card>
      )}
    </div>
  );
}

function ProfileForm({
  employee,
  onSaved,
}: {
  employee: Employee;
  onSaved: (employee: Employee) => void;
}) {
  const { toast } = useToast();

  const [values, setValues] = useState({
    firstName: employee.firstName,
    lastName: employee.lastName,
    displayName: employee.displayName,
    jobTitle: employee.jobTitle,
    jobDescription: employee.jobDescription ?? "",
    department: employee.department,
    employmentType: employee.employmentType ?? "",
    // <input type="date"> only understands yyyy-MM-dd, so an ISO timestamp has
    // to be trimmed or the field renders empty.
    expiredDate: employee.expiredDate ? employee.expiredDate.slice(0, 10) : "",
    locationType: employee.locationType ?? "",
    branchName: employee.branchName ?? "",
    description: employee.description ?? "",
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

  const isContract = values.employmentType === "CONTRACT";
  const isBranch = values.locationType === "CABANG";
  const locked = Boolean(employee.activeRequestId);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setErrors({});

    const result = await putJson<{ employee: Employee; message: string }>(
      `/api/users/${employee.id}`,
      values,
    );

    if (result.ok) {
      onSaved(result.data.employee);
      toast(result.data.message, "success");
    } else {
      setErrors(result.failure.fieldErrors ?? {});
      setError(result.failure.fieldErrors ? null : result.failure.message);
    }

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
            Karyawan ini sedang dalam proses persetujuan, jadi profilnya dikunci sampai
            permintaan itu selesai atau dibatalkan.
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
              hint="Untuk pindah divisi, gunakan alur Movement agar tetap lewat persetujuan."
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

        <div className="flex items-center gap-3 border-t border-hairline pt-4">
          <Button type="submit" loading={saving} disabled={locked}>
            {saving ? "Menyimpan…" : "Simpan perubahan"}
          </Button>
          <p className="text-xs text-ink-muted">
            Email dan manager tidak diubah di sini — keduanya terikat ke akun login dan pengajuan email
            persetujuan.
          </p>
        </div>
      </form>
    </Card>
  );
}
