"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { IconSync } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import { postJson } from "@/lib/client/accountsApi";
import type { RunReport } from "@/lib/lifecycle/worker";

/**
 * Runs the execution worker by hand.
 *
 * Deliberate rather than automatic. In the demo there is nothing else to
 * trigger it, and a background loop would change a directory at a moment
 * nobody chose — so an operator presses this and sees exactly what happened.
 *
 * A run that fails to finish a job is reported as a normal outcome, not an
 * error: the request lands in FAILED with a structured reason, which is the
 * thing an operator needs to read.
 */
export function RunWorkerButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const result = await postJson<RunReport>("/api/worker/run", {});

    if (result.ok) {
      const { ran, completed, failed } = result.data;
      if (ran === 0) toast("Tidak ada pekerjaan yang jatuh tempo.", "info");
      else if (failed === 0) toast(`${completed} pengajuan selesai dijalankan.`, "success");
      else toast(`${completed} selesai, ${failed} gagal. Periksa detailnya.`, "info");
      router.refresh();
    } else {
      toast(result.failure.message, "error");
    }

    setBusy(false);
  }

  return (
    <Button variant="secondary" size="sm" loading={busy} icon={<IconSync />} onClick={run}>
      Jalankan worker
    </Button>
  );
}
