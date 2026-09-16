"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { postJson } from "@/lib/client/accountsApi";
import type { LifecycleRequest } from "@/lib/lifecycle/types";

/**
 * Withdrawing a request.
 *
 * Only offered while the state machine still allows it — which stops at the
 * moment a worker claims the job. Past that, the change may already be part-way
 * applied to the directory, and a button reporting "cancelled" would be
 * describing something that did not happen.
 */
export function CancelRequestButton({ request }: { request: LifecycleRequest }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function cancel() {
    setBusy(true);
    const result = await postJson<{ request: LifecycleRequest }>(
      `/api/lifecycle-requests/${request.id}/cancel`,
      {},
    );

    if (result.ok) {
      toast("Pengajuan dibatalkan.", "info");
      router.refresh();
      return;
    }

    toast(result.failure.message, "error");
    setBusy(false);
    setConfirming(false);
  }

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        Batalkan pengajuan
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs text-ink-muted">Batalkan pengajuan ini?</span>
      <Button variant="danger" size="sm" loading={busy} onClick={cancel}>
        Ya, batalkan
      </Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
        Tidak
      </Button>
    </span>
  );
}
