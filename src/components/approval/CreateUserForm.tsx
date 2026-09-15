"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { FormAlert } from "@/components/accounts/FormAlert";
import { WorkflowProgress } from "@/components/approval/WorkflowProgress";
import { Button } from "@/components/ui/Button";
import { Card, Field, SelectField, TextareaField } from "@/components/ui/Field";
import { IconBuilding, IconLock, IconMail, IconNote, IconUser, IconUserCheck } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import { postJson } from "@/lib/client/accountsApi";
import { DEPARTMENTS } from "@/lib/config/approvalEnv";
import { checkPasswordStrength } from "@/lib/validation/approvalInput";

/**
 * HC's form for creating an account that must be approved before it works.
 *
 * Checks the same rules as the server before submitting, so most mistakes are
 * caught while the person is still looking at the field, and the server's
 * per-field errors land beside the same fields when they are not.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMPTY = {
  email: "",
  fullName: "",
  password: "",
  confirmPassword: "",
  department: "",
  managerName: "",
  managerEmail: "",
  cisoName: "",
  cisoEmail: "",
  notes: "",
};

type Values = typeof EMPTY;
type Errors = Partial<Record<keyof Values, string>>;

function validate(v: Values): Errors {
  const errors: Errors = {};
  const email = v.email.trim().toLowerCase();
  const manager = v.managerEmail.trim().toLowerCase();
  const ciso = v.cisoEmail.trim().toLowerCase();

  if (!EMAIL_PATTERN.test(email)) errors.email = "Masukkan email yang valid.";
  if (v.fullName.trim().length < 2) errors.fullName = "Nama lengkap minimal 2 karakter.";
  const password = checkPasswordStrength(v.password);
  if (password) errors.password = password;
  if (v.confirmPassword !== v.password) errors.confirmPassword = "Konfirmasi kata sandi tidak cocok.";
  if (!v.department) errors.department = "Pilih departemen.";
  if (v.managerName.trim().length < 2) errors.managerName = "Nama manager wajib diisi.";
  if (!EMAIL_PATTERN.test(manager)) errors.managerEmail = "Masukkan email manager yang valid.";
  else if (manager === email) errors.managerEmail = "Manager tidak boleh sama dengan user yang diajukan.";
  if (v.cisoName.trim().length < 2) errors.cisoName = "Nama CISO wajib diisi.";
  if (!EMAIL_PATTERN.test(ciso)) errors.cisoEmail = "Masukkan email CISO yang valid.";
  else if (ciso === email) errors.cisoEmail = "CISO tidak boleh sama dengan user yang diajukan.";
  else if (ciso === manager) errors.cisoEmail = "CISO dan manager harus orang yang berbeda.";
  return errors;
}

/** 0–4, for the meter only. The rule that blocks submission is checkPasswordStrength. */
function strength(password: string): number {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Za-z]/.test(password) && /\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password) || (/[a-z]/.test(password) && /[A-Z]/.test(password))) score += 1;
  return score;
}

const METER = ["bg-danger", "bg-danger", "bg-warn", "bg-info", "bg-ok"];
const METER_LABEL = ["Terlalu lemah", "Lemah", "Cukup", "Kuat", "Sangat kuat"];

interface Created {
  requestId: string;
  fullName: string;
  managerEmail: string;
  emailDelivery: "sent" | "logged";
}

export function CreateUserForm() {
  const { toast } = useToast();
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  const score = useMemo(() => strength(values.password), [values.password]);

  function update(field: keyof Values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setError("Periksa kembali isian yang ditandai.");
      return;
    }

    setSubmitting(true);
    const result = await postJson<{ message: string; requestId: string; emailDelivery: "sent" | "logged" }>(
      "/api/auth/register-with-approval",
      { ...values, notes: values.notes.trim() || undefined },
    );
    setSubmitting(false);

    if (!result.ok) {
      setErrors((result.failure.fieldErrors as Errors) ?? {});
      setError(result.failure.message);
      return;
    }

    const sent = result.data.emailDelivery === "sent";
    toast(
      sent
        ? "Pengajuan terkirim. Email persetujuan sudah dikirim ke manager."
        : "Pengajuan dibuat, tetapi email BELUM dikirim: akun Gmail pengirim belum dipasang.",
      sent ? "success" : "error",
    );
    setCreated({
      requestId: result.data.requestId,
      fullName: values.fullName.trim(),
      managerEmail: values.managerEmail.trim().toLowerCase(),
      emailDelivery: result.data.emailDelivery,
    });
  }

  if (created) {
    return (
      <Card className="space-y-6 p-6">
        <FormAlert tone="success">
          <p className="font-medium">Akun {created.fullName} dibuat dan menunggu persetujuan.</p>
          {created.emailDelivery === "sent" ? (
            <p className="opacity-90">
              Email persetujuan dikirim ke <span className="font-mono">{created.managerEmail}</span>.
              Akun belum bisa dipakai sampai manager dan CISO menyetujui.
            </p>
          ) : (
            <p className="opacity-90">
              Email untuk <span className="font-mono">{created.managerEmail}</span> hanya dicatat di log server
              dan <strong>tidak dikirim</strong>, karena akun Gmail pengirim belum dipasang.
            </p>
          )}
        </FormAlert>
        <WorkflowProgress status="PENDING" createdAt={new Date().toISOString()} />
        <p className="font-mono text-xs text-ink-faint">ID pengajuan: {created.requestId}</p>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => {
              setValues(EMPTY);
              setErrors({});
              setCreated(null);
            }}
          >
            Buat pengajuan lain
          </Button>
          <Link
            href="/approval-requests"
            className="inline-flex items-center rounded-lg border border-hairline-strong px-3.5 py-2 text-sm font-medium text-ink hover:border-accent/50"
          >
            Lihat dashboard approval
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <FormAlert tone="error">{error}</FormAlert>

      <Card className="space-y-5 p-6">
        <div>
          <h2 className="text-base font-semibold text-ink">Data user</h2>
          <p className="text-sm text-ink-muted">Akun dibuat nonaktif sampai seluruh persetujuan selesai.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama lengkap" name="fullName" icon={<IconUser className="size-4" />} value={values.fullName} onChange={(e) => update("fullName", e.target.value)} error={errors.fullName} placeholder="Nadia Kusuma" autoComplete="off" />
          <Field label="Email" name="email" type="email" icon={<IconMail className="size-4" />} value={values.email} onChange={(e) => update("email", e.target.value)} error={errors.email} placeholder="nadia.kusuma@perusahaan.co.id" autoComplete="off" />
        </div>
        <SelectField label="Departemen" name="department" icon={<IconBuilding className="size-4" />} value={values.department} onChange={(e) => update("department", e.target.value)} error={errors.department}>
          <option value="">Pilih departemen…</option>
          {DEPARTMENTS.map((department) => (
            <option key={department} value={department}>
              {department}
            </option>
          ))}
        </SelectField>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Field label="Kata sandi" name="password" type="password" icon={<IconLock className="size-4" />} value={values.password} onChange={(e) => update("password", e.target.value)} error={errors.password} hint="Minimal 8 karakter, berisi huruf dan angka." autoComplete="new-password" />
            {values.password ? (
              <div className="mt-2 flex items-center gap-2" aria-live="polite">
                <div className="flex flex-1 gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className={`h-1 flex-1 rounded-full ${i < score ? METER[score] : "bg-hairline"}`} />
                  ))}
                </div>
                <span className="text-xs text-ink-muted">{METER_LABEL[score]}</span>
              </div>
            ) : null}
          </div>
          <Field label="Konfirmasi kata sandi" name="confirmPassword" type="password" icon={<IconLock className="size-4" />} value={values.confirmPassword} onChange={(e) => update("confirmPassword", e.target.value)} error={errors.confirmPassword} autoComplete="new-password" />
        </div>
      </Card>

      <Card className="space-y-5 p-6">
        <div>
          <h2 className="text-base font-semibold text-ink">Penyetuju</h2>
          <p className="text-sm text-ink-muted">
            Manager menerima email lebih dulu. Setelah manager setuju, email diteruskan ke CISO.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama manager" name="managerName" icon={<IconUserCheck className="size-4" />} value={values.managerName} onChange={(e) => update("managerName", e.target.value)} error={errors.managerName} placeholder="Dimas Prakoso" />
          <Field label="Email manager" name="managerEmail" type="email" icon={<IconMail className="size-4" />} value={values.managerEmail} onChange={(e) => update("managerEmail", e.target.value)} error={errors.managerEmail} placeholder="manager@perusahaan.co.id" />
          <Field label="Nama CISO / IT Security" name="cisoName" icon={<IconLock className="size-4" />} value={values.cisoName} onChange={(e) => update("cisoName", e.target.value)} error={errors.cisoName} placeholder="Tim CISO Cyber Security" />
          <Field label="Email CISO / IT Security" name="cisoEmail" type="email" icon={<IconMail className="size-4" />} value={values.cisoEmail} onChange={(e) => update("cisoEmail", e.target.value)} error={errors.cisoEmail} placeholder="ciso@perusahaan.co.id" />
        </div>
        <TextareaField label="Keterangan (opsional)" name="notes" icon={<IconNote className="size-4" />} rows={3} value={values.notes} onChange={(e) => update("notes", e.target.value)} error={errors.notes} placeholder="Konteks untuk penyetuju, misalnya proyek atau tanggal mulai kerja." />
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={submitting}>
          {submitting ? "Mengirim pengajuan…" : "Ajukan & kirim email persetujuan"}
        </Button>
        <p className="text-xs text-ink-muted">Akun tidak aktif sebelum manager dan CISO menyetujui.</p>
      </div>
    </form>
  );
}
