"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, TextareaField } from "@/components/ui/Field";
import { FormAlert } from "@/components/ui/FormAlert";
import { IconCheck, IconClose } from "@/components/ui/Icons";
import { postJson } from "@/lib/client/accountsApi";

/**
 * Deciding from the link in an email.
 *
 * The token stays in the URL and is posted from here — never rendered into the
 * page, never put in a query string this form submits, never echoed back by the
 * response. The decision is a POST for the same reason the link opens a page
 * instead of deciding: anything that follows URLs in a mailbox must not be able
 * to approve anything.
 */
export function TokenDecisionForm({ token, stage }: { token: string; stage: "MANAGER" | "CISO" }) {
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ decision: string; status: string } | null>(null);

  async function decide(decision: "APPROVED" | "REJECTED") {
    setBusy(decision);
    setError(null);

    const result = await postJson<{ requestId: string; status: string; decision: string }>(
      "/api/approval-actions",
      { token, decision, reason: reason.trim() || undefined },
    );

    if (result.ok) {
      setDone({ decision: result.data.decision, status: result.data.status });
      return;
    }

    setError(result.failure.message);
    setBusy(null);
  }

  if (done) {
    const approved = done.decision === "APPROVED";
    return (
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border ${
              approved ? "border-ok/30 bg-ok/10 text-ok" : "border-danger/30 bg-danger/10 text-danger"
            }`}
          >
            {approved ? <IconCheck className="size-4" /> : <IconClose className="size-4" />}
          </span>
          <div>
            <h2 className="text-lg font-semibold text-ink">
              {approved ? "Persetujuan Anda tercatat" : "Penolakan Anda tercatat"}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {approved
                ? "Terima kasih. Tautan ini sudah dipakai dan tidak berlaku lagi."
                : "Pemohon akan melihat alasan yang Anda tulis. Tautan ini sudah tidak berlaku."}
            </p>
            {approved ? (
              <p className="mt-3 rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-xs leading-relaxed text-warn">
                Persetujuan mengesahkan perubahan, bukan menjalankannya. Akun baru berubah setelah
                eksekusi dijalankan dan hasilnya diverifikasi.
              </p>
            ) : null}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
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
