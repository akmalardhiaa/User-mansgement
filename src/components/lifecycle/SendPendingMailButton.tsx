"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { IconMail } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import { postJson } from "@/lib/client/accountsApi";
import type { DispatchReport } from "@/lib/lifecycle/dispatcher";

/**
 * Sends the approval emails the outbox owes.
 *
 * Submitting a request only commits the obligation to send: the row lands in
 * the outbox inside the same transaction as the status change, and nothing
 * leaves the building until a dispatcher runs. There is no scheduler, so
 * without this nothing runs it at all — and a queued message waits forever
 * while the request sits pending on somebody who was never told.
 *
 * It dispatches everything that is due, not only this request's mail. The
 * endpoint takes the whole queue, and a button that read as narrower than the
 * action would misdescribe what just happened.
 *
 * "Diterima provider" is as far as the wording goes, here and in the panel
 * around it. A provider accepting a message means it has taken responsibility
 * for trying; nothing in this system ever learns whether it arrived.
 */
export function SendPendingMailButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const result = await postJson<DispatchReport>("/api/outbox/dispatch", {});

    if (result.ok) {
      const { attempted, accepted, retried, dead } = result.data;
      if (attempted === 0) {
        toast("Tidak ada email yang jatuh tempo.", "info");
      } else if (dead > 0) {
        toast(`${accepted} diterima provider, ${dead} gagal permanen.`, "error");
      } else if (retried > 0) {
        toast(`${accepted} diterima provider, ${retried} akan dicoba lagi.`, "info");
      } else {
        toast(`${accepted} email diterima provider.`, "success");
      }
      router.refresh();
    } else {
      toast(result.failure.message, "error");
    }

    setBusy(false);
  }

  return (
    <Button variant="secondary" size="sm" loading={busy} icon={<IconMail />} onClick={run}>
      Kirim email tertunda
    </Button>
  );
}
