"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormAlert } from "@/components/accounts/FormAlert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { IconLock, IconMail } from "@/components/ui/Icons";
import { postJson } from "@/lib/client/accountsApi";

/** Credential form for the HC dashboard. */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setUnverified(false);
    setResendNote(null);

    const result = await postJson<{ user: { email: string } }>("/api/auth/login", {
      email,
      password,
    });

    if (result.ok) {
      // A full navigation, so the server components re-render with the session.
      router.replace(next);
      router.refresh();
      return;
    }

    setError(result.failure.message);
    // The one login failure the person can act on from here, so it gets its
    // own affordance rather than just a sentence telling them to go and look.
    setUnverified(result.failure.code === "EMAIL_NOT_VERIFIED");
    setSubmitting(false);
  }

  async function resend() {
    setResendNote(null);
    const result = await postJson<{ message: string }>("/api/auth/resend-verification", { email });
    setResendNote(result.ok ? result.data.message : result.failure.message);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <FormAlert tone="error">
        {error ? (
          <>
            <p>{error}</p>
            {unverified ? (
              <button
                type="button"
                onClick={() => void resend()}
                className="font-medium underline underline-offset-2"
              >
                Kirim ulang tautan konfirmasi
              </button>
            ) : null}
          </>
        ) : null}
      </FormAlert>

      <FormAlert tone="info">{resendNote}</FormAlert>

      <Field
        label="Email"
        name="email"
        type="email"
        icon={<IconMail className="size-4" />}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="ayu.prameswari@example.com"
        autoComplete="username"
      />
      <Field
        label="Kata sandi"
        name="password"
        type="password"
        icon={<IconLock className="size-4" />}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="••••••••"
        autoComplete="current-password"
      />

      <Button type="submit" loading={submitting} className="w-full">
        {submitting ? "Masuk…" : "Masuk"}
      </Button>
    </form>
  );
}
