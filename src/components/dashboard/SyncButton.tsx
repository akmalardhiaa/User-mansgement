"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";

/**
 * Triggers the polling fallback (`POST /api/workflow/sync`) on demand — handy
 * when the app is running locally and Jira cannot reach the webhook endpoint.
 */
export function SyncButton() {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sync() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/workflow/sync", { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Sync failed.");
      const { checked, advanced } = payload.data as { checked: number; advanced: number };
      setMessage(
        advanced > 0
          ? `Advanced ${advanced} of ${checked} open request(s).`
          : `Checked ${checked} open request(s); nothing changed.`,
      );
      startTransition(() => router.refresh());
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {message ? <span className="text-xs text-ink-faint">{message}</span> : null}
      <Button variant="secondary" onClick={sync} disabled={busy || isRefreshing}>
        {busy ? "Syncing…" : "Sync from Jira"}
      </Button>
    </div>
  );
}
