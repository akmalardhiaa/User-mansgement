"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, Field, SelectField } from "@/components/ui/Field";
import { IconLock, IconMail, IconUser } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import type { PublicUser } from "@/lib/auth/types";
import { postJson } from "@/lib/client/accountsApi";

const EMPTY = { fullName: "", email: "", password: "", role: "USER" };

/**
 * Adds an account that can sign in immediately — typically a manager or CISO.
 *
 * Once an approver has an account, every request naming their email lands in
 * their "Persetujuan saya" page on its own, with no email or API key involved.
 */
export function CreateAccountCard({ onCreated }: { onCreated: (user: PublicUser) => void }) {
  const { toast } = useToast();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function update(field: keyof typeof EMPTY, value: string) {
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
    setSaving(true);
    const result = await postJson<{ user: PublicUser }>("/api/accounts", values);
    setSaving(false);

    if (!result.ok) {
      setErrors(result.failure.fieldErrors ?? {});
      if (!result.failure.fieldErrors) toast(result.failure.message, "error");
      return;
    }

    toast(`Akun ${result.data.user.fullName} dibuat dan bisa langsung login.`, "success");
    onCreated(result.data.user);
    setValues(EMPTY);
    setErrors({});
  }

  return (
    <Card className="p-5">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Tambah akun penyetuju</h2>
          <p className="text-xs text-ink-muted">
            Untuk manager atau CISO. Pengajuan yang mencantumkan email mereka otomatis muncul di halaman
            &ldquo;Persetujuan saya&rdquo; setelah mereka login.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Nama lengkap" name="newFullName" icon={<IconUser className="size-4" />} value={values.fullName} onChange={(e) => update("fullName", e.target.value)} error={errors.fullName} placeholder="Dimas Prakoso" />
          <Field label="Email" name="newEmail" type="email" icon={<IconMail className="size-4" />} value={values.email} onChange={(e) => update("email", e.target.value)} error={errors.email} placeholder="dimas@perusahaan.co.id" />
          <Field label="Kata sandi" name="newPassword" type="password" icon={<IconLock className="size-4" />} value={values.password} onChange={(e) => update("password", e.target.value)} error={errors.password} hint="Minimal 8 karakter." autoComplete="new-password" />
          <SelectField label="Peran" name="newRole" value={values.role} onChange={(e) => update("role", e.target.value)} error={errors.role}>
            <option value="USER">USER (penyetuju)</option>
            <option value="ADMIN">ADMIN (HC)</option>
          </SelectField>
        </div>
        <Button type="submit" loading={saving}>
          {saving ? "Membuat akun…" : "Buat akun"}
        </Button>
      </form>
    </Card>
  );
}
