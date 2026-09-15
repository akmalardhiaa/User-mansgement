"use client";

import { useState } from "react";

import { FormAlert } from "@/components/accounts/FormAlert";
import { Button } from "@/components/ui/Button";
import { IconAlert, IconCheck } from "@/components/ui/Icons";
import { postJson } from "@/lib/client/accountsApi";
import type { AccessRequest, Employee } from "@/lib/types";
import type { HandoffKind } from "@/lib/workflow/emailApproval";

type Decision = "APPROVED" | "REJECTED" | "COMPLETED";

/**
 * The action control on the emailed hand-off page.
 *
 * A client component only because the decision has to be a POST — see the note
 * in the route handler about mail scanners following links. The surrounding
 * page is server-rendered.
 *
 * The destructive choice asks for a second click; the constructive one does
 * not. Approving one step too far is recoverable by HC, while a rejection ends
 * the request and sends the joiner back to the start.
 */
export function ApprovalDecision({
  token,
  kind,
  employee,
  request,
  expiresAt,
}: {
  token: string;
  kind: HandoffKind;
  employee: Employee;
  request: AccessRequest;
  expiresAt: string;
}) {
  const [submitting, setSubmitting] = useState<Decision | null>(null);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ decision: string; message: string } | null>(null);

  const isSecurity = kind === "SECURITY";

  const heading = isSecurity
    ? request.type === "TRANSFER"
      ? "Penyesuaian akses"
      : request.type === "OFFBOARDING"
        ? "Pencabutan akses"
        : "Penyiapan akses"
    : request.type === "TRANSFER"
      ? "Permintaan pindah divisi"
      : request.type === "OFFBOARDING"
        ? "Permintaan penonaktifan akun"
        : "Permintaan akun baru";

  const checklist = isSecurity
    ? request.type === "OFFBOARDING"
      ? [
          "Nonaktifkan akun direktori",
          "Cabut pendaftaran SSO dan profil VPN",
          "Hentikan penerusan mailbox",
          "Cabut seluruh role aplikasi",
        ]
      : request.type === "TRANSFER"
        ? [
            "Cabut role dan grup divisi lama",
            "Berikan role dan grup divisi baru",
            "Sesuaikan akses aplikasi dan folder bersama",
          ]
        : [
            "Akun direktori",
            "Mailbox email",
            "Pendaftaran SSO",
            "Profil VPN",
            "Role aplikasi dasar sesuai departemen",
          ]
    : [];

  const rows: Array<[string, string]> = [
    ["Nama", employee.displayName],
    ["Email", employee.email],
    ...(request.type === "TRANSFER"
      ? ([
          ["Posisi saat ini", `${employee.jobTitle} — ${employee.department}`],
          [
            "Posisi tujuan",
            request.transfer
              ? `${request.transfer.jobTitle} — ${request.transfer.department}`
              : "—",
          ],
        ] as Array<[string, string]>)
      : ([
          ["Jabatan", employee.jobTitle],
          ["Departemen", employee.department],
        ] as Array<[string, string]>)),
    ...(request.reason ? ([["Alasan", request.reason]] as Array<[string, string]>) : []),
  ];

  async function decide(decision: Decision) {
    setSubmitting(decision);
    setError(null);

    const result = await postJson<{ decision: string; message: string }>(
      `/api/hc-approvals/${encodeURIComponent(token)}`,
      { decision },
    );

    if (result.ok) setDone(result.data);
    else setError(result.failure.message);

    setSubmitting(null);
  }

  if (done) {
    const bad = done.decision === "REJECTED";
    return (
      <div className="space-y-3 text-sm">
        <p className={`flex items-center gap-2 font-semibold ${bad ? "text-danger" : "text-ok"}`}>
          {bad ? <IconAlert className="size-4" /> : <IconCheck className="size-4" />}
          {bad
            ? "Permintaan ditolak"
            : isSecurity
              ? "Penyiapan ditandai selesai"
              : "Permintaan disetujui"}
        </p>
        <p className="text-ink-muted">{done.message}</p>
        <p className="text-xs text-ink-faint">
          Sudah tercatat. Tautan ini tidak bisa dipakai lagi, dan Anda boleh menutup halaman ini.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">
          {isSecurity ? "Tim CISO Cyber Security" : "Persetujuan manager"}
        </p>
        <h1 className="mt-1.5 text-xl font-bold text-ink">{heading}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {isSecurity
            ? "Permintaan ini sudah disetujui manager. Tandai selesai setelah aksesnya dikerjakan."
            : "Human Capital meminta persetujuan Anda untuk permintaan berikut."}
        </p>
      </div>

      <FormAlert tone="error">{error}</FormAlert>

      <dl className="divide-y divide-hairline border-y border-hairline">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[9rem_1fr] gap-3 py-2.5">
            <dt className="text-sm text-ink-muted">{label}</dt>
            <dd className="text-sm font-medium break-words text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {checklist.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[0.1em] text-ink-muted uppercase">
            Yang perlu dikerjakan
          </p>
          <ul className="space-y-1.5">
            {checklist.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-ink">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {isSecurity ? (
          <Button
            variant="success"
            loading={submitting === "COMPLETED"}
            disabled={submitting !== null}
            onClick={() => void decide("COMPLETED")}
            icon={<IconCheck className="size-4" />}
          >
            Tandai selesai
          </Button>
        ) : (
          <>
            <Button
              variant="success"
              loading={submitting === "APPROVED"}
              disabled={submitting !== null}
              onClick={() => void decide("APPROVED")}
              icon={<IconCheck className="size-4" />}
            >
              Setujui
            </Button>

            {confirmingReject ? (
              <>
                <Button
                  variant="danger"
                  loading={submitting === "REJECTED"}
                  disabled={submitting !== null}
                  onClick={() => void decide("REJECTED")}
                >
                  Yakin, tolak
                </Button>
                <Button
                  variant="ghost"
                  disabled={submitting !== null}
                  onClick={() => setConfirmingReject(false)}
                >
                  Batal
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                disabled={submitting !== null}
                onClick={() => setConfirmingReject(true)}
              >
                Tolak
              </Button>
            )}
          </>
        )}
      </div>

      <p className="text-xs text-ink-faint">
        Tautan ini berlaku sampai{" "}
        {new Date(expiresAt).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" })} dan
        hanya bisa dipakai sekali.
      </p>
    </div>
  );
}
