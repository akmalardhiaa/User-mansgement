"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { IconSync } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import { postJson } from "@/lib/client/accountsApi";
import type { LifecycleRequest } from "@/lib/lifecycle/types";

/**
 * Queues a failed execution again.
 *
 * Whether a retry is allowed is decided by the server, not here — some failures
 * must never be repeated, and a button that knew which ones would be a second
 * copy of a rule that has to live in one place.
 *
 * The reconciliation prompt is the one piece of judgement this surfaces. When a
 * worker vanished mid-job, the directory may be part-way changed by a process
 * nobody can ask, so the operator is asked to confirm they have compared the
 * object against the checkpoints. No code can verify that; what it can do is
 * record who claimed it.
 */
export function RetryButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [needsAcknowledgement, setNeedsAcknowledgement] = useState<string | null>(null);

  async function retry(acknowledgedReconciliation = false) {
    setBusy(true);

    const result = await postJson<{ request: LifecycleRequest }>(
      `/api/lifecycle-requests/${requestId}/retry`,
      { acknowledgedReconciliation },
    );

    if (result.ok) {
      toast("Pengajuan dimasukkan kembali ke antrean eksekusi.", "success");
      setNeedsAcknowledgement(null);
      router.refresh();
      return;
    }

    // The server distinguishes "you must confirm first" from "this can never be
    // retried". Only the first is worth offering a way past.
    if (/rekonsiliasi/i.test(result.failure.message)) {
      setNeedsAcknowledgement(result.failure.message);
    } else {
      toast(result.failure.message, "error");
    }

    setBusy(false);
  }

  if (needsAcknowledgement) {
    return (
      <div className="w-full space-y-2.5 rounded-lg border border-warn/40 bg-warn/10 px-3.5 py-3 text-xs leading-relaxed text-warn">
        <p>{needsAcknowledgement}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" size="sm" loading={busy} onClick={() => retry(true)}>
            Sudah saya rekonsiliasi — antrekan lagi
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setNeedsAcknowledgement(null)}
          >
            Batal
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={busy}
      icon={<IconSync />}
      onClick={() => retry(false)}
    >
      Coba jalankan lagi
    </Button>
  );
}
