"use client";

import { useCallback, useEffect, useState } from "react";

import { FormAlert } from "@/components/accounts/FormAlert";
import { StatusPill, WorkflowProgress } from "@/components/approval/WorkflowProgress";
import { Button } from "@/components/ui/Button";
import { TextareaField } from "@/components/ui/Field";
import { IconCheck } from "@/components/ui/Icons";
import type { ApprovalView, TokenState } from "@/lib/approval/service";
import { getJson, postJson } from "@/lib/client/accountsApi";

type Role = "manager" | "it_security";

interface TokenData {
  role: Role;
  state: TokenState;
  expiresAt: string | null;
  request: ApprovalView;
}

const ROLE_TITLE: Record<Role, string> = {
  manager: "Persetujuan Manager",
  it_security: "Persetujuan CISO / IT Security",
};

const CLOSED_COPY: Record<Exclude<TokenState, "actionable">, { title: string; body: string }> = {
  used: { title: "Keputusan sudah tercatat", body: "Tautan ini sudah dipakai dan tidak bisa digunakan lagi." },
  expired: { title: "Tautan kedaluwarsa", body: "Batas waktu persetujuan sudah lewat. Hubungi Human Capital untuk pengajuan ulang." },
  closed: { title: "Tidak menunggu keputusan Anda", body: "Permintaan ini sudah berada di tahap lain." },
};

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" }) : "—";
}

/**
 * The page an approver lands on from their email.
 *
 * Opening it changes nothing — only the buttons do, via POST — so a mail
 * scanner that follows the link cannot approve anything. `initialAction`
 * comes from which email button was pressed and only preselects the choice.
 */
export function ApprovalPage({ token, initialAction }: { token: string; initialAction?: "approve" | "reject" }) {
  const [data, setData] = useState<TokenData | null>(null);
  // A missing token is known on the first render, so it is initial state rather
  // than something an effect discovers and then re-renders to show.
  const [loadError, setLoadError] = useState<string | null>(
    token ? null : "Tautan tidak lengkap. Buka halaman ini dari tombol di email Anda.",
  );
  const [loading, setLoading] = useState(Boolean(token));
  const [rejecting, setRejecting] = useState(initialAction === "reject");
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState<"approve" | "reject" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ approved: boolean; message: string } | null>(null);

  const url = `/api/approval/${encodeURIComponent(token)}`;

  // State is set in the promise callback, never synchronously inside the
  // effect, and a response that arrives after unmount is dropped.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void getJson<TokenData>(url).then((result) => {
      if (cancelled) return;
      if (result.ok) setData(result.data);
      else setLoadError(result.failure.message);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token, url]);

  /** Re-reads after a decision, so the timeline shows the step that just completed. */
  const load = useCallback(async () => {
    const result = await getJson<TokenData>(url);
    if (result.ok) setData(result.data);
  }, [url]);

  async function decide(kind: "approve" | "reject") {
    if (!data) return;
    setActionError(null);
    if (kind === "reject" && reason.trim().length < 5) {
      setReasonError("Tuliskan alasan penolakan (minimal 5 karakter).");
      return;
    }

    setSubmitting(kind);
    const result = await postJson<{ message: string }>(`/api/approval/${kind}`, {
      token,
      approvingRole: data.role,
      ...(kind === "reject" ? { reason: reason.trim() } : {}),
    });
    setSubmitting(null);

    if (!result.ok) {
      setActionError(result.failure.message);
      return;
    }
    setOutcome({ approved: kind === "approve", message: result.data.message });
    // Re-read so the timeline shows the step that just completed.
    await load();
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-4 w-40 animate-pulse rounded bg-hairline" />
        <div className="h-7 w-64 animate-pulse rounded bg-hairline" />
        <div className="h-24 animate-pulse rounded-xl bg-hairline/60" />
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <FormAlert tone="error">
        <p className="font-medium">Tautan tidak bisa dibuka</p>
        <p className="opacity-90">{loadError}</p>
      </FormAlert>
    );
  }

  const { request, role, state } = data;
  const rows: Array<[string, string]> = [
    ["Nama", request.employee.fullName],
    ["Email", request.employee.email],
    ["Departemen", request.employee.department],
    ["Diajukan oleh", `${request.requesterName} (HC)`],
    ["Manager", `${request.managerName} · ${request.managerApprovedAt ? `setuju ${formatDate(request.managerApprovedAt)}` : "belum memutuskan"}`],
    ...(request.notes ? ([["Keterangan", request.notes]] as Array<[string, string]>) : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">{ROLE_TITLE[role]}</p>
          <h1 className="mt-1 text-xl font-bold text-ink">Persetujuan user baru</h1>
        </div>
        <StatusPill status={request.status} />
      </div>

      <WorkflowProgress {...request} />

      <dl className="divide-y divide-hairline border-y border-hairline">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 py-2.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
            <dt className="text-sm text-ink-muted">{label}</dt>
            <dd className="text-sm font-medium break-words text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {outcome ? (
        <FormAlert tone="success">
          {/* FormAlert already draws the leading icon; a second one here doubled it. */}
          <p className="font-medium">{outcome.approved ? "Persetujuan tercatat" : "Penolakan tercatat"}</p>
          <p className="opacity-90">{outcome.message}</p>
        </FormAlert>
      ) : state !== "actionable" ? (
        <FormAlert tone="info">
          <p className="font-medium">{CLOSED_COPY[state].title}</p>
          <p className="opacity-90">{CLOSED_COPY[state].body}</p>
          {request.rejectionReason ? <p className="opacity-90">Alasan penolakan: {request.rejectionReason}</p> : null}
        </FormAlert>
      ) : (
        <div className="space-y-4">
          <FormAlert tone="error">{actionError}</FormAlert>

          {rejecting ? (
            <TextareaField
              label="Alasan penolakan"
              name="reason"
              rows={3}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setReasonError(undefined);
              }}
              error={reasonError}
              placeholder="Jelaskan kenapa permohonan ini ditolak. Alasan dikirim ke Human Capital."
              autoFocus
            />
          ) : null}

          <div className="flex flex-wrap gap-3">
            {rejecting ? (
              <>
                <Button variant="danger" loading={submitting === "reject"} disabled={submitting !== null} onClick={() => void decide("reject")}>
                  Kirim penolakan
                </Button>
                <Button variant="ghost" disabled={submitting !== null} onClick={() => setRejecting(false)}>
                  Batal
                </Button>
              </>
            ) : (
              <>
                <Button variant="success" icon={<IconCheck className="size-4" />} loading={submitting === "approve"} disabled={submitting !== null} onClick={() => void decide("approve")}>
                  {role === "manager" ? "Setujui" : "Setujui & aktifkan akun"}
                </Button>
                <Button variant="ghost" disabled={submitting !== null} onClick={() => setRejecting(true)}>
                  Tolak
                </Button>
              </>
            )}
          </div>

          <p className="text-xs text-ink-faint">
            Tautan berlaku sampai {formatDate(data.expiresAt)} dan hanya bisa dipakai sekali.
          </p>
        </div>
      )}
    </div>
  );
}
