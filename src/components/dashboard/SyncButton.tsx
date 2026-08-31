"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { apiDataSource, type DashboardDataSource } from "@/lib/client/dataSource";

/**
 * Triggers the polling fallback (`POST /api/workflow/sync`) on demand — handy
 * when the app is running locally and Jira cannot reach the webhook endpoint.
 */
export function SyncButton({
  dataSource = apiDataSource,
  onChanged,
}: {
  dataSource?: DashboardDataSource;
  onChanged?: () => void;
} = {}) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sync() {
    setBusy(true);
    setMessage(null);
    try {
      const { checked, advanced } = await dataSource.sync();
      setMessage(
        advanced > 0
          ? `Advanced ${advanced} of ${checked} open request(s).`
          : `Checked ${checked} open request(s); nothing changed.`,
      );
      if (onChanged) {
        onChanged();
      } else {
        startTransition(() => router.refresh());
      }
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
