"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormAlert } from "@/components/ui/FormAlert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { IconLock, IconUser } from "@/components/ui/Icons";
import { postJson } from "@/lib/client/accountsApi";

/** Active Directory login for the HC directory. */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await postJson<{ user: { email: string } }>("/api/auth/login", {
      username,
      password,
    });

    if (result.ok) {
      // A full navigation, so the server components re-render with the session.
      router.replace(next);
      router.refresh();
      return;
    }

    setError(result.failure.message);
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <FormAlert tone="error">{error}</FormAlert>

      <Field
        label="Username"
        name="username"
        icon={<IconUser className="size-4" />}
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        placeholder="nama.pengguna atau email"
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
