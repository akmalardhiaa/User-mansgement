"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AnimatePresence, motion } from "framer-motion";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { IconAlert, IconLock, IconMail } from "@/components/ui/Icons";
import { TRANSITION_FAST } from "@/lib/motion";

/** Credential form for the HC dashboard. */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Login gagal.");
      }
      // A full navigation, so the server components re-render with the session.
      router.replace(next);
      router.refresh();
    } catch (cause) {
      setError((cause as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <AnimatePresence initial={false}>
        {error ? (
          <motion.p
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={TRANSITION_FAST}
            className="flex items-start gap-2 overflow-hidden rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
          >
            <IconAlert className="mt-0.5 size-4 shrink-0" />
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>

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
