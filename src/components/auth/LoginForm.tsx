"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useT } from "@/components/i18n/LocaleProvider";
import { FormAlert } from "@/components/ui/FormAlert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { IconLock, IconUser, IconUserCheck } from "@/components/ui/Icons";
import { postJson } from "@/lib/client/accountsApi";

type MfaStep =
  | { mode: "verify" }
  | { mode: "enroll"; account: string; issuer: string; secret: string; qr: string };

interface LoginAnswer {
  user?: { email: string };
  mfa?: MfaStep;
}

/** The secret in fours, the way authenticator apps print it — easier to copy by eye. */
function grouped(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Active Directory login for the HC directory, in up to two steps: the
 * password, then — when two-step verification is on — the code from the
 * person's authenticator app, with a QR code to connect the phone the first
 * time.
 */
export function LoginForm({ next }: { next: string }) {
  const t = useT();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<MfaStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function signedIn() {
    // A full navigation, so the server components re-render with the session.
    router.replace(next);
    router.refresh();
  }

  async function handlePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await postJson<LoginAnswer>("/api/auth/login", { username, password });

    if (result.ok && result.data.mfa) {
      // The password is not kept once it has done its job.
      setPassword("");
      setCode("");
      setStep(result.data.mfa);
      setSubmitting(false);
      return;
    }
    if (result.ok) {
      signedIn();
      return;
    }

    setError(result.failure.message);
    setSubmitting(false);
  }

  async function handleCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await postJson<LoginAnswer>("/api/auth/mfa", { code });
    if (result.ok) {
      signedIn();
      return;
    }

    // An expired or exhausted step cannot be continued: back to the password.
    if (["MFA_EXPIRED", "ACCOUNT_LOCKED", "MFA_RESET_REQUIRED"].includes(result.failure.code ?? "")) {
      setStep(null);
    }
    setCode("");
    setError(result.failure.message);
    setSubmitting(false);
  }

  function backToPassword() {
    setStep(null);
    setCode("");
    setError(null);
  }

  if (step) {
    return (
      <form onSubmit={handleCode} noValidate className="space-y-5">
        <FormAlert tone="error">{error}</FormAlert>

        {step.mode === "enroll" ? (
          <div className="space-y-3 text-sm">
            <p className="font-semibold text-ink">{t.login.mfaEnrollTitle}</p>
            <p className="text-ink-muted">{t.login.mfaEnrollIntro}</p>
            <ol className="list-decimal space-y-1 pl-5 text-ink-muted">
              <li>{t.login.mfaEnrollStep1}</li>
              <li>{t.login.mfaEnrollStep2}</li>
              <li>{t.login.mfaEnrollStep3}</li>
            </ol>
            <div className="flex justify-center">
              {/* A data: URI drawn on the server, not an asset next/image could optimise. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={step.qr}
                alt={t.login.mfaQrAlt}
                width={192}
                height={192}
                className="rounded-lg bg-white p-2"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-ink-muted">{t.login.mfaManualKey}</p>
              <p className="select-all break-all rounded-md border border-hairline bg-surface px-3 py-2 font-mono text-sm tracking-wider text-ink">
                {grouped(step.secret)}
              </p>
              <p className="text-xs text-ink-muted">
                {step.issuer} · {step.account}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-ink">{t.login.mfaVerifyTitle}</p>
            <p className="text-ink-muted">{t.login.mfaVerifyBody}</p>
          </div>
        )}

        <Field
          label={t.login.mfaCode}
          name="code"
          icon={<IconUserCheck className="size-4" />}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/[^\d ]/g, "").slice(0, 7))}
          placeholder="123 456"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
        />

        <Button type="submit" loading={submitting} className="w-full">
          {submitting ? t.login.mfaSubmitting : t.login.mfaSubmit}
        </Button>
        <button
          type="button"
          onClick={backToPassword}
          className="w-full text-center text-sm text-ink-muted underline-offset-4 hover:underline"
        >
          {t.login.mfaBack}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handlePassword} noValidate className="space-y-5">
      <FormAlert tone="error">{error}</FormAlert>

      <Field
        label={t.login.username}
        name="username"
        icon={<IconUser className="size-4" />}
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        placeholder={t.login.usernamePlaceholder}
        autoComplete="username"
      />
      <Field
        label={t.login.password}
        name="password"
        type="password"
        icon={<IconLock className="size-4" />}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="••••••••"
        autoComplete="current-password"
      />

      <Button type="submit" loading={submitting} className="w-full">
        {submitting ? t.login.submitting : t.login.submit}
      </Button>
    </form>
  );
}
