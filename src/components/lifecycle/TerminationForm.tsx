"use client";

import { useState } from "react";

import { createAndSubmit } from "@/components/lifecycle/submitRequest";
import { Button } from "@/components/ui/Button";
import { Card, Field, SelectField, TextareaField } from "@/components/ui/Field";
import { FormAlert } from "@/components/ui/FormAlert";
import { IconAlert, IconClock, IconNote, IconUser, IconUserCheck } from "@/components/ui/Icons";
import { TERMINATION_REASONS, type LifecycleRequest, type TerminationReason } from "@/lib/lifecycle/types";
import type { Employee } from "@/lib/types";

const SECTION =
  "mb-4 flex items-center gap-2 text-xs font-medium tracking-[0.14em] text-ink-faint uppercase";

const REASON_LABEL: Record<TerminationReason, string> = {
  RESIGN: "Mengundurkan diri",
  CONTRACT_END: "Kontrak berakhir",
  RETIREMENT: "Pensiun",
  TERMINATION: "Pemutusan hubungan kerja",
  OTHER: "Lainnya",
};

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
  onSubmitted,
}: {
  /** Already excludes anyone with a request in flight. */
  employees: Employee[];
  initialEmployeeId?: string;
  onSubmitted: (request: LifecycleRequest) => void;
}) {
  const [employeeId, setEmployeeId] = useState(initialEmployeeId ?? "");
  const [values, setValues] = useState({
    reasonCategory: "RESIGN",
    lastWorkingDate: "",
    handoverTo: "",
    note: "",
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
      type: "TERMINATION",
      employeeId,
      ...values,
      handoverTo: values.handoverTo || undefined,
      note: values.note || undefined,
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

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} noValidate className="space-y-8">
        <FormAlert tone="error">{formError}</FormAlert>

        <div>
          <p className={SECTION}>
            <IconUser className="size-3.5" />
            Karyawan yang dinonaktifkan
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

          {employee ? (
            <div className="mt-4 rounded-xl border border-hairline bg-elevated/40 p-4 text-sm">
              <p className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
                Akun yang terdampak
              </p>
              <dl className="mt-2.5 space-y-1.5">
                {[
                  ["Nama", employee.displayName],
                  ["Email", employee.email],
                  ["Jabatan", `${employee.jobTitle} · ${employee.department}`],
                  ["Manager", employee.managerName],
                ].map(([label, value]) => (
                  <div key={label} className="flex gap-3">
                    <dt className="w-24 shrink-0 text-xs text-ink-faint">{label}</dt>
                    <dd className="min-w-0 truncate font-medium text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 border-t border-hairline pt-2.5 text-xs text-ink-muted">
                Persetujuan tahap pertama diminta ke <strong className="text-ink">{employee.managerName}</strong>,
                manager saat ini.
              </p>
            </div>
          ) : null}
        </div>

        <div>
          <p className={SECTION}>
            <IconNote className="size-3.5" />
            Alasan dan jadwal
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              label="Kategori alasan"
              name="reasonCategory"
              value={values.reasonCategory}
              onChange={(event) => update("reasonCategory", event.target.value)}
              error={fieldErrors.reasonCategory}
              hint="Kategori saja — detailnya tidak dikirim ke approver."
            >
              {TERMINATION_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {REASON_LABEL[reason]}
                </option>
              ))}
            </SelectField>

            <Field
              label="Tanggal terakhir bekerja"
              name="lastWorkingDate"
              type="date"
              icon={<IconClock className="size-4" />}
              value={values.lastWorkingDate}
              onChange={(event) => update("lastWorkingDate", event.target.value)}
              error={fieldErrors.lastWorkingDate}
            />

            <Field
              label="Waktu efektif penonaktifan (opsional)"
              name="effectiveAt"
              type="date"
              icon={<IconClock className="size-4" />}
              value={values.effectiveAt}
              onChange={(event) => update("effectiveAt", event.target.value)}
              error={fieldErrors.effectiveAt}
              hint="Kosongkan agar dijalankan segera setelah kedua approval masuk."
            />

            <Field
              label="Serah terima kepada (opsional)"
              name="handoverTo"
              icon={<IconUserCheck className="size-4" />}
              value={values.handoverTo}
              onChange={(event) => update("handoverTo", event.target.value)}
              error={fieldErrors.handoverTo}
              placeholder="Nama rekan yang melanjutkan pekerjaan"
            />

            <TextareaField
              label="Catatan internal (opsional)"
              name="note"
              rows={3}
              icon={<IconNote className="size-4" />}
              value={values.note}
              onChange={(event) => update("note", event.target.value)}
              error={fieldErrors.note}
              hint="Tersimpan di pengajuan. Tidak pernah dimasukkan ke email persetujuan."
              className="sm:col-span-2"
            />
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3.5 py-3 text-xs leading-relaxed text-warn">
          <IconAlert className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1.5">
            <p>
              Tindakan default adalah <strong>menonaktifkan dan mengarantina</strong> akun, bukan
              menghapusnya. Penghapusan permanen memerlukan proses terpisah.
            </p>
            <p>
              Menonaktifkan akun di direktori tidak otomatis memutus sesi yang sudah berjalan —
              tiket Kerberos, VPN, dan sesi Microsoft 365 punya masa hidup sendiri. Pencabutan
              menyeluruh memerlukan integrasi tambahan yang belum ada.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
          <Button type="submit" variant="danger" loading={submitting} disabled={!employeeId}>
            {submitting ? "Mengirim…" : "Kirim ke approver"}
          </Button>
          <p className="text-xs text-ink-faint">
            Akses belum dicabut. Pengajuan dikirim ke manager, lalu CISO.
          </p>
        </div>
      </form>
    </Card>
  );
}
