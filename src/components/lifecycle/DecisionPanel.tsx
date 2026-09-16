"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, TextareaField } from "@/components/ui/Field";
import { FormAlert } from "@/components/ui/FormAlert";
import { IconCheck, IconClose } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import { postJson } from "@/lib/client/accountsApi";
import type { ApprovalStage, LifecycleRequest } from "@/lib/lifecycle/types";

/**
 * Approving or rejecting, from the portal.
 *
 * Whether this panel is rendered at all was decided on the server: the viewer
 * holds the role for this stage AND is the person the stage was addressed to.
 * The server checks both again on every submit — this is a convenience, not a
 * control, and a panel that is merely hidden protects nothing.
 *
 * A rejection needs a reason and the button stays disabled without one. Not
 * because the server would accept a blank one (it refuses), but because the
 * requester is going to read it, and "rejected, no reason given" is how a
 * request gets raised again unchanged.
 *
 * The version travels with the decision. If the request was revised while this
 * screen was open, the submit is refused rather than recording an approval
 * against text this person never saw.
 */
export function DecisionPanel({
  request,
  stage,
}: {
  request: LifecycleRequest;
  stage: ApprovalStage;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "APPROVED" | "REJECTED") {
    setBusy(decision);
    setError(null);

    const result = await postJson<{ request: LifecycleRequest }>(
      `/api/lifecycle-requests/${request.id}/decision`,
      { version: request.version, stage, decision, reason: reason.trim() || undefined },
    );

    if (result.ok) {
      toast(
        decision === "APPROVED"
          ? "Persetujuan Anda tercatat."
          : "Penolakan tercatat. Pemohon akan melihat alasannya.",
        decision === "APPROVED" ? "success" : "info",
      );
      router.refresh();
      return;
    }

    setError(result.failure.message);
    setBusy(null);
  }

  return (
    <Card className="border-accent/40 p-5">
      <h2 className="text-sm font-semibold text-ink">
        Keputusan Anda — tahap {stage === "MANAGER" ? "Manager" : "CISO"}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        {stage === "MANAGER"
          ? "Anda menyetujui kebutuhan divisi atas perubahan ini."
          : "Anda menyetujui dampak aksesnya. Persetujuan ini mengesahkan perubahan, bukan menjalankannya."}
      </p>

      <div className="mt-4 space-y-4">
        <FormAlert tone="error">{error}</FormAlert>

        {rejecting ? (
          <TextareaField
            label="Alasan penolakan"
            name="reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Jelaskan apa yang perlu diperbaiki sebelum diajukan ulang."
            hint="Wajib diisi. Pemohon membaca alasan ini."
          />
        ) : null}

        <div className="flex flex-wrap gap-2.5">
          {rejecting ? (
            <>
              <Button
                variant="danger"
                icon={<IconClose />}
                loading={busy === "REJECTED"}
                disabled={reason.trim().length === 0 || busy !== null}
                onClick={() => decide("REJECTED")}
              >
                Kirim penolakan
              </Button>
              <Button variant="ghost" disabled={busy !== null} onClick={() => setRejecting(false)}>
                Batal
              </Button>
            </>
          ) : (
            <>
              <Button
                icon={<IconCheck />}
                loading={busy === "APPROVED"}
                disabled={busy !== null}
                onClick={() => decide("APPROVED")}
              >
                Setujui
              </Button>
              <Button
                variant="danger"
                icon={<IconClose />}
                disabled={busy !== null}
                onClick={() => setRejecting(true)}
              >
                Tolak
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
