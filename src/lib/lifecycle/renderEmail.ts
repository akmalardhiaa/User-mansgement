import type { EmailMessage } from "@/lib/email/types";

import type { ApprovalMailPayload } from "./outbox";
import type { LifecycleType } from "./types";

/**
 * Turning a queued event into the message somebody actually reads.
 *
 * The HTML body is not a fallback in the sense of being second-best: it is what
 * most clients will show, and it has to carry the whole request on its own. The
 * Adaptive Card is an enhancement for Outlook, and the plan is explicit that a
 * browser round-trip must never be presented as satisfying "decide from the
 * email" — so the card and the link say the same things.
 *
 * Adaptive Card 1.0 with `Action.Http`, deliberately. Version 1.4 and above use
 * `Action.Execute`, which is a different model rather than a larger number, and
 * the proof of concept starts where the plan says to start.
 */

const TYPE_LABEL: Record<LifecycleType, string> = {
  ONBOARDING: "Onboarding",
  MOVEMENT: "Movement",
  TERMINATION: "Termination",
};

function baseUrl(): string {
  return (process.env.APP_BASE_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f4f6f9;font-family:Segoe UI,Arial,sans-serif;color:#0a1c33">
<div style="max-width:600px;margin:0 auto;padding:24px">
<div style="background:#ffffff;border:1px solid #d5e0ee;border-radius:12px;padding:24px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#44607f">HC User Management</p>
${body}
</div>
<p style="margin:16px 0 0;font-size:11px;color:#44607f">Email ini dikirim otomatis oleh portal Human Capital. Jangan meneruskannya — tautan di dalamnya hanya berlaku untuk penerima yang ditunjuk.</p>
</div></body></html>`;
}

function detailRows(payload: ApprovalMailPayload): string {
  const rows: Array<[string, string]> = [
    ["Jenis", TYPE_LABEL[payload.type]],
    ["Karyawan", payload.subjectName],
    ["Diajukan oleh", payload.requesterName],
    ["Nomor", payload.requestId],
    ["Versi", String(payload.version)],
    ["Waktu efektif", payload.effectiveAt ? formatDate(payload.effectiveAt) : "Segera setelah disetujui"],
  ];

  if (payload.managerDecision) {
    rows.push([
      "Persetujuan manager",
      `${payload.managerDecision.by} · ${formatDate(payload.managerDecision.at)}`,
    ]);
  }

  return rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#44607f;font-size:13px">${escapeHtml(label)}</td>` +
        `<td style="padding:6px 0;font-size:13px;font-weight:600">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
}

/** The Adaptive Card, for clients that support one. */
function buildCard(payload: ApprovalMailPayload, actionUrl: string): unknown {
  return {
    type: "AdaptiveCard",
    version: "1.0",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    hideOriginalBody: true,
    body: [
      {
        type: "TextBlock",
        size: "Medium",
        weight: "Bolder",
        text: `Persetujuan ${TYPE_LABEL[payload.type]} — ${payload.subjectName}`,
        wrap: true,
      },
      {
        type: "FactSet",
        facts: [
          { title: "Diajukan oleh", value: payload.requesterName },
          { title: "Nomor", value: payload.requestId },
          { title: "Versi", value: String(payload.version) },
          ...(payload.managerDecision
            ? [{ title: "Manager", value: `${payload.managerDecision.by} menyetujui` }]
            : []),
        ],
      },
    ],
    actions: [
      {
        type: "Action.Http",
        title: "Setujui",
        method: "POST",
        url: actionUrl,
        body: JSON.stringify({ token: payload.token, decision: "APPROVED" }),
        headers: [{ name: "Content-Type", value: "application/json" }],
      },
      {
        /*
         * A rejection collects its reason in the card. The requester is going to
         * read it, and "rejected, no reason given" is how a request comes back
         * unchanged — so the field is part of the action rather than something
         * to chase afterwards.
         */
        type: "Action.Http",
        title: "Tolak",
        method: "POST",
        url: actionUrl,
        body: JSON.stringify({ token: payload.token, decision: "REJECTED", reason: "{{reason.value}}" }),
        headers: [{ name: "Content-Type", value: "application/json" }],
        inputs: [
          {
            type: "Input.Text",
            id: "reason",
            isMultiline: true,
            isRequired: true,
            title: "Alasan penolakan",
          },
        ],
      },
    ],
  };
}

export function renderEmail(payload: ApprovalMailPayload, recipient: string): EmailMessage {
  const base = baseUrl();

  if (payload.kind === "approval.request" && payload.token) {
    const decisionUrl = `${base}/persetujuan/${payload.token}`;
    const actionUrl = `${base}/api/approval-actions`;

    const body = `
<h1 style="margin:0 0 12px;font-size:20px">Permintaan persetujuan ${escapeHtml(TYPE_LABEL[payload.type])}</h1>
<p style="margin:0 0 16px;font-size:14px;line-height:1.6">Halo ${escapeHtml(payload.approverName)}, ada pengajuan yang menunggu keputusan Anda sebagai <strong>${payload.stage === "MANAGER" ? "Manager" : "CISO"}</strong>.</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:20px">${detailRows(payload)}</table>
<a href="${escapeHtml(decisionUrl)}" style="display:inline-block;background:#fdb713;color:#0a1c33;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px">Buka halaman keputusan</a>
<p style="margin:20px 0 0;font-size:12px;color:#44607f;line-height:1.6">Tautan ini sekali pakai dan memiliki masa berlaku. Belum ada perubahan apa pun pada akun — perubahan baru dijalankan setelah kedua persetujuan masuk dan hasilnya diverifikasi.</p>`;

    return {
      to: { address: recipient, name: payload.approverName },
      subject: `[Persetujuan] ${TYPE_LABEL[payload.type]} — ${payload.subjectName}`,
      html: shell("Permintaan persetujuan", body),
      card: buildCard(payload, actionUrl),
    };
  }

  const approved = payload.outcome === "APPROVED";
  const body = `
<h1 style="margin:0 0 12px;font-size:20px">Pengajuan ${approved ? "disetujui" : "ditolak"}</h1>
<p style="margin:0 0 16px;font-size:14px;line-height:1.6">Pengajuan ${escapeHtml(TYPE_LABEL[payload.type])} untuk <strong>${escapeHtml(payload.subjectName)}</strong> ${approved ? "telah disetujui kedua approver" : "ditolak"}.</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:20px">${detailRows(payload)}</table>
${payload.reason ? `<p style="margin:0 0 16px;padding:12px;background:#fbe9ee;border-radius:8px;font-size:13px"><strong>Alasan:</strong> ${escapeHtml(payload.reason)}</p>` : ""}
<a href="${escapeHtml(`${base}/pengajuan/${payload.requestId}`)}" style="display:inline-block;background:#173d6e;color:#ffffff;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px">Lihat pengajuan</a>
${approved ? `<p style="margin:20px 0 0;font-size:12px;color:#44607f;line-height:1.6">Perubahan sudah sah tetapi <strong>belum tentu selesai dijalankan</strong>. Status akun baru berubah setelah eksekusi diverifikasi.</p>` : ""}`;

  return {
    to: { address: recipient, name: payload.requesterName },
    subject: `[${approved ? "Disetujui" : "Ditolak"}] ${TYPE_LABEL[payload.type]} — ${payload.subjectName}`,
    html: shell("Hasil pengajuan", body),
  };
}
