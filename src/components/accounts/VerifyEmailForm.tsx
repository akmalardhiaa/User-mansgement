"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { FormAlert } from "@/components/accounts/FormAlert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { IconCheck, IconMail } from "@/components/ui/Icons";
import { postJson } from "@/lib/client/accountsApi";

interface VerifyResponse {
  message: string;
}

type Status = "idle" | "working" | "verified" | "failed";

/**
 * Email confirmation.
 *
 * The token arrives in the link as `?token=`, so the usual path is that this
 * runs on its own and the person never types anything. The field is still here
 * and still editable, because mail clients truncate long URLs and someone who
 * has to copy the code out by hand needs somewhere to put it.
 */
export function VerifyEmailForm({ initialToken }: { initialToken: string }) {
  const router = useRouter();
  const [token, setToken] = useState(initialToken);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  // Resend state lives here rather than in its own component: it is only ever
  // reachable from the expired branch below.
  const [resendEmail, setResendEmail] = useState("");
  const [resendNote, setResendNote] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  /**
   * Guards the automatic submit. React 18+ runs effects twice in development,
   * and without this the token would be spent by the first run and reported
   * invalid by the second — a failure that only ever appears in dev and looks
   * exactly like a real bug.
   */
  const attempted = useRef(false);

  async function verify(value: string) {
    setStatus("working");
    setMessage(null);
    setExpired(false);

    const result = await postJson<VerifyResponse>("/api/auth/verify-email", { token: value });

    if (result.ok) {
      setStatus("verified");
      setMessage(result.data.message);
      // Refresh so the chrome picks up any session change before the person
      // clicks through to the login screen.
      router.refresh();
      return;
    }

    setStatus("failed");
    setMessage(result.failure.message);
    setExpired(result.failure.code === "TOKEN_EXPIRED");
  }

  useEffect(() => {
    if (!initialToken || attempted.current) return;
    attempted.current = true;
    void verify(initialToken);
    // Runs once for the token the page was opened with; later attempts come
    // from the form's own submit handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialToken]);

  async function handleResend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResending(true);
    setResendNote(null);

    const result = await postJson<{ message: string }>("/api/auth/resend-verification", {
      email: resendEmail,
    });

    setResendNote(result.ok ? result.data.message : result.failure.message);
    setResending(false);
  }

  if (status === "verified") {
    return (
      <div className="space-y-4">
        <FormAlert tone="success">
          <p className="font-medium">{message}</p>
        </FormAlert>
        <Link href="/login" className="block">
          <Button className="w-full" icon={<IconCheck className="size-4" />}>
            Lanjut ke halaman masuk
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <FormAlert tone="error">{status === "failed" ? message : null}</FormAlert>

      {expired ? (
        <form onSubmit={handleResend} className="space-y-4 rounded-xl border border-hairline bg-canvas/40 p-4">
          <p className="text-sm text-ink-muted">
            Masukkan email Anda dan kami kirimkan tautan konfirmasi yang baru.
          </p>
          <Field
            label="Email"
            name="resendEmail"
            type="email"
            icon={<IconMail className="size-4" />}
            value={resendEmail}
            onChange={(event) => setResendEmail(event.target.value)}
            placeholder="ayu.prameswari@example.com"
            autoComplete="email"
            required
          />
          <Button type="submit" variant="secondary" loading={resending} className="w-full">
            {resending ? "Mengirim…" : "Kirim ulang tautan"}
          </Button>
          <FormAlert tone="info">{resendNote}</FormAlert>
        </form>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void verify(token.trim());
        }}
        noValidate
        className="space-y-5"
      >
        <Field
          label="Kode konfirmasi"
          name="token"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          hint="Biasanya terisi otomatis dari tautan di email Anda."
          placeholder="Tempel kode dari email"
          className="font-mono"
          required
        />
        <Button type="submit" loading={status === "working"} className="w-full">
          {status === "working" ? "Memeriksa…" : "Konfirmasi email"}
        </Button>
      </form>

      <p className="text-center text-sm text-ink-muted">
        <Link href="/login" className="font-medium text-accent hover:underline">
          Kembali ke halaman masuk
        </Link>
      </p>
    </div>
  );
}
