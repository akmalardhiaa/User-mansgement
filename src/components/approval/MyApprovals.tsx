"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { FormAlert } from "@/components/accounts/FormAlert";
import { StatusPill, WorkflowProgress } from "@/components/approval/WorkflowProgress";
import { Button } from "@/components/ui/Button";
import { Card, TextareaField } from "@/components/ui/Field";
import { IconCheck, IconInbox, IconSync } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import type { ApprovalView } from "@/lib/approval/service";
import { getJson, postJson } from "@/lib/client/accountsApi";

type MyRequest = ApprovalView & { myRole: "manager" | "it_security" };

const ROLE_LABEL = { manager: "Anda sebagai Manager", it_security: "Anda sebagai CISO / IT Security" };

function when(value: string): string {
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * The approver's inbox inside the portal.
 *
 * Needs no email and no link: signing in is the proof of identity, and the
 * server decides from the account's own address which step it may act on.
 */
export function MyApprovals() {
  const { toast } = useToast();
  const router = useRouter();
  const [requests, setRequests] = useState<MyRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();

  // State is set in the promise callback, never synchronously in the effect.
  useEffect(() => {
    let cancelled = false;
    void getJson<{ requests: MyRequest[] }>("/api/my-approvals").then((result) => {
      if (cancelled) return;
      if (result.ok) setRequests(result.data.requests);
      else setError(result.failure.message);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(async () => {
    const result = await getJson<{ requests: MyRequest[] }>("/api/my-approvals");
    if (result.ok) {
      setRequests(result.data.requests);
      setError(null);
      router.refresh();
    } else {
      setError(result.failure.message);
    }
  }, [router]);

  async function decide(request: MyRequest, kind: "approve" | "reject") {
    if (kind === "reject" && reason.trim().length < 5) {
      setReasonError("Tuliskan alasan penolakan (minimal 5 karakter).");
      return;
    }
    setBusy(request.id);
    const result = await postJson<{ message: string }>(
      `/api/my-approvals/${request.id}/${kind}`,
      kind === "reject" ? { reason: reason.trim() } : {},
    );
    setBusy(null);

    if (!result.ok) {
      toast(result.failure.message, "error");
      return;
    }
    toast(result.data.message, "success");
    setRejectingId(null);
    setReason("");
    setRequests((current) => (current ?? []).filter((item) => item.id !== request.id));
    // The "N pengajuan menunggu" banner is rendered by the layout on the
    // server; without a refresh it keeps counting the request just decided.
    router.refresh();
  }

  if (error) return <FormAlert tone="error">{error}</FormAlert>;

  if (!requests) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-32 animate-pulse rounded-2xl bg-hairline/60" />
        <div className="h-32 animate-pulse rounded-2xl bg-hairline/40" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {requests.length === 0 ? "Tidak ada yang menunggu keputusan Anda." : `${requests.length} pengajuan menunggu keputusan Anda.`}
        </p>
        <Button variant="secondary" size="sm" icon={<IconSync className="size-4" />} onClick={() => void reload()}>
          Muat ulang
        </Button>
      </div>

      {requests.length === 0 ? (
        <Card className="grid place-items-center gap-2 p-10 text-center">
          <IconInbox className="size-8 text-ink-faint" />
          <p className="text-sm text-ink-muted">Semua sudah diputuskan. Pengajuan baru akan muncul di sini.</p>
        </Card>
      ) : null}

      {requests.map((request) => (
        <Card key={request.id} className="space-y-5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.12em] text-accent uppercase">{ROLE_LABEL[request.myRole]}</p>
              <h2 className="mt-1 text-lg font-semibold text-ink">{request.employee.fullName}</h2>
              <p className="font-mono text-xs text-ink-muted">{request.employee.email}</p>
            </div>
            <StatusPill status={request.status} />
          </div>

          <WorkflowProgress {...request} />

          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-ink-muted">Departemen</dt><dd className="font-medium text-ink">{request.employee.department}</dd></div>
            <div><dt className="text-ink-muted">Diajukan oleh</dt><dd className="font-medium text-ink">{request.requesterName} (HC) · {when(request.createdAt)}</dd></div>
            {request.managerApprovedAt ? (
              <div><dt className="text-ink-muted">Manager</dt><dd className="font-medium text-ink">{request.managerName} · setuju {when(request.managerApprovedAt)}</dd></div>
            ) : null}
            {request.notes ? (
              <div className="sm:col-span-2"><dt className="text-ink-muted">Keterangan</dt><dd className="font-medium text-ink">{request.notes}</dd></div>
            ) : null}
          </dl>

          {rejectingId === request.id ? (
            <TextareaField
              label="Alasan penolakan"
              name={`reason-${request.id}`}
              rows={3}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setReasonError(undefined);
              }}
              error={reasonError}
              placeholder="Alasan dikirim ke Human Capital."
              autoFocus
            />
          ) : null}

          <div className="flex flex-wrap gap-3">
            {rejectingId === request.id ? (
              <>
                <Button variant="danger" loading={busy === request.id} onClick={() => void decide(request, "reject")}>
                  Kirim penolakan
                </Button>
                <Button variant="ghost" disabled={busy === request.id} onClick={() => setRejectingId(null)}>
                  Batal
                </Button>
              </>
            ) : (
              <>
                <Button variant="success" icon={<IconCheck className="size-4" />} loading={busy === request.id} onClick={() => void decide(request, "approve")}>
                  {request.myRole === "manager" ? "Setujui" : "Setujui & aktifkan akun"}
                </Button>
                <Button variant="ghost" disabled={busy === request.id} onClick={() => { setRejectingId(request.id); setReason(""); setReasonError(undefined); }}>
                  Tolak
                </Button>
              </>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
