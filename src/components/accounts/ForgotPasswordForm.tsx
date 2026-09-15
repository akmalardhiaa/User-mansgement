"use client";

import Link from "next/link";
import { useState } from "react";

import { FormAlert } from "@/components/accounts/FormAlert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { IconMail } from "@/components/ui/Icons";
import { postJson } from "@/lib/client/accountsApi";

/**
 * Requests a password-reset link.
 *
 * The confirmation is deliberately non-committal — "if that address is
 * registered" — and it is shown for every valid address. Saying "no such
 * account" would make this public form a way to find out which addresses have
 * accounts, one guess at a time.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldError(undefined);

    const result = await postJson<{ message: string }>("/api/auth/forgot-password", { email });

    if (result.ok) {
      setSent(result.data.message);
    } else {
      setFieldError(result.failure.fieldErrors?.email);
      setError(result.failure.fieldErrors ? null : result.failure.message);
    }

    setSubmitting(false);
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <FormAlert tone="success">
          <p className="font-medium">{sent}</p>
          <p className="opacity-90">Tautan berlaku 1 jam dan hanya bisa dipakai sekali.</p>
        </FormAlert>
        <p className="text-sm text-ink-muted">
          Tidak menerima email? Periksa folder spam, atau{" "}
          <button
            type="button"
            onClick={() => setSent(null)}
            className="font-medium text-accent hover:underline"
          >
            coba alamat lain
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <FormAlert tone="error">{error}</FormAlert>

      <Field
        label="Email"
        name="email"
        type="email"
        icon={<IconMail className="size-4" />}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={fieldError}
        hint="Kami kirimkan tautan untuk membuat kata sandi baru."
        placeholder="ayu.prameswari@example.com"
        autoComplete="email"
        required
      />

      <Button type="submit" loading={submitting} className="w-full">
        {submitting ? "Mengirim…" : "Kirim tautan reset"}
      </Button>

      <p className="text-center text-sm text-ink-muted">
        Ingat kata sandi Anda?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Masuk
        </Link>
      </p>
    </form>
  );
}
