"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormAlert } from "@/components/accounts/FormAlert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { IconLock } from "@/components/ui/Icons";
import { postJson } from "@/lib/client/accountsApi";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/accountInput";

/**
 * Sets a new password from a reset link.
 *
 * The token is held in state rather than posted from a hidden input read out
 * of `location`, so the value that gets submitted is the one the page was
 * opened with. An expired or spent link is called out specifically, with the
 * way back to request another, because that is the one failure here a person
 * can actually do something about.
 */
export function PasswordResetForm({ initialToken }: { initialToken: string }) {
  const router = useRouter();
  const [token] = useState(initialToken);
  const [values, setValues] = useState({ password: "", confirmPassword: "" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="space-y-4">
        <FormAlert tone="error">
          <p className="font-medium">Tautan tidak lengkap.</p>
          <p className="opacity-90">
            Buka halaman ini dari tautan di email Anda, atau minta tautan baru.
          </p>
        </FormAlert>
        <Link href="/forgot-password" className="block">
          <Button variant="secondary" className="w-full">
            Minta tautan baru
          </Button>
        </Link>
      </div>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setExpired(false);
    setFieldErrors({});

    if (values.password !== values.confirmPassword) {
      setFieldErrors({ confirmPassword: "Konfirmasi kata sandi tidak cocok." });
      setSubmitting(false);
      return;
    }

    const result = await postJson<{ message: string }>("/api/auth/reset-password", {
      token,
      ...values,
    });

    if (result.ok) {
      setDone(result.data.message);
      // The route cleared the session cookie, so the chrome is now showing a
      // signed-in state that no longer exists.
      router.refresh();
    } else {
      setFieldErrors(result.failure.fieldErrors ?? {});
      setError(result.failure.fieldErrors ? null : result.failure.message);
      setExpired(result.failure.code === "TOKEN_EXPIRED" || result.failure.code === "TOKEN_INVALID");
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <FormAlert tone="success">
          <p className="font-medium">{done}</p>
        </FormAlert>
        <Link href="/login" className="block">
          <Button className="w-full">Masuk dengan kata sandi baru</Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <FormAlert tone="error">{error}</FormAlert>

      {expired ? (
        <Link href="/forgot-password" className="block">
          <Button type="button" variant="secondary" className="w-full">
            Minta tautan baru
          </Button>
        </Link>
      ) : null}

      <Field
        label="Kata sandi baru"
        name="password"
        type="password"
        icon={<IconLock className="size-4" />}
        value={values.password}
        onChange={(event) => setValues((v) => ({ ...v, password: event.target.value }))}
        error={fieldErrors.password}
        hint={`Minimal ${PASSWORD_MIN_LENGTH} karakter.`}
        placeholder="••••••••"
        autoComplete="new-password"
        required
      />
      <Field
        label="Konfirmasi kata sandi baru"
        name="confirmPassword"
        type="password"
        icon={<IconLock className="size-4" />}
        value={values.confirmPassword}
        onChange={(event) => setValues((v) => ({ ...v, confirmPassword: event.target.value }))}
        error={fieldErrors.confirmPassword}
        placeholder="••••••••"
        autoComplete="new-password"
        required
      />

      <Button type="submit" loading={submitting} className="w-full">
        {submitting ? "Menyimpan…" : "Simpan kata sandi baru"}
      </Button>
    </form>
  );
}
