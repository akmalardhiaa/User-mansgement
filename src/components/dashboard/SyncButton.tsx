"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { IconSync } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import { apiDataSource, type DashboardDataSource } from "@/lib/client/dataSource";

/**
 * Triggers the polling fallback (`POST /api/workflow/sync`) on demand — handy
 * when the app is running locally and Jira cannot reach the webhook endpoint.
 *
 * The result used to print beside the button, where a long sentence shoved the
 * page header around every time it ran. It goes to the toast channel now, with
 * the rest of the app's confirmations.
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
  const [busy, setBusy] = useState(false);

  const { toast } = useToast();

  async function sync() {
    setBusy(true);
    try {
      const { checked, advanced } = await dataSource.sync();
      toast(
        advanced > 0
          ? `${advanced} dari ${checked} pengajuan terbuka diperbarui.`
          : `${checked} pengajuan terbuka dicek; tidak ada perubahan.`,
        advanced > 0 ? "success" : "info",
      );
      if (onChanged) {
        onChanged();
      } else {
        startTransition(() => router.refresh());
      }
    } catch (cause) {
      toast((cause as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="secondary"
      onClick={sync}
      loading={busy || isRefreshing}
      icon={<IconSync />}
      title="Tarik status terbaru dari Jira tanpa menunggu webhook"
    >
      Sinkronkan
    </Button>
  );
}
