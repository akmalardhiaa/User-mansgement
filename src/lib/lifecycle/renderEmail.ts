import type { EmailMessage } from "@/lib/email/types";

import { accessProfileLabel } from "./accessProfiles";
import type { ApprovalMailPayload } from "./outbox";
import type { LifecyclePayload, LifecycleType, TerminationReason } from "./types";

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

/** Same wording as the portal's summary, so the two never say different things. */
const REASON_LABEL: Record<TerminationReason, string> = {
  RESIGN: "Mengundurkan diri",
  CONTRACT_END: "Kontrak berakhir",
  RETIREMENT: "Pensiun",
  TERMINATION: "Pemutusan hubungan kerja",
  OTHER: "Lainnya",
};

/**
 * The request itself, as the approver needs to see it.
 *
 * Mirrors RequestPayloadSummary field for field. An approver reading the email
 * and an approver reading the portal must be deciding on the same text — a
 * shorter version in the inbox is how somebody approves something they never
 * actually read.
 *
 * The termination note is absent here and, more importantly, absent from the
 * payload this is given: see mailSafePayload in outbox.ts.
 */
function payloadRows(payload: LifecyclePayload): Array<[string, string]> {
  if (payload.kind === "ONBOARDING") {
    return [
      ["NIK", payload.nik],
      ["Nama", payload.displayName],
      ["Email", payload.email],
      ["Jabatan", payload.jobTitle],
      ["Departemen", payload.department],
      [
        "Status kepegawaian",
        payload.employmentType === "CONTRACT"
          ? `Kontrak · berakhir ${payload.expiredDate ?? "—"}`
          : "Karyawan tetap",
      ],
      [
        "Lokasi",
        payload.locationType === "CABANG"
          ? `Cabang · ${payload.branchName ?? "—"}`
          : "Kantor pusat",
      ],
      ["Manager", `${payload.managerName} · ${payload.managerEmail}`],
      ["Mulai bekerja", payload.startDate],
      ["Profil akses", accessProfileLabel(payload.accessProfileId)],
      ...(payload.jobDescription
        ? [["Keterangan jabatan", payload.jobDescription] as [string, string]]
        : []),
    ];
  }

  if (payload.kind === "MOVEMENT") {
    return [
      ["Departemen tujuan", payload.toDepartment],
      ["Jabatan tujuan", payload.toJobTitle],
      ["Manager tujuan", `${payload.toManagerName} · ${payload.toManagerEmail}`],
      ["Profil akses baru", accessProfileLabel(payload.accessProfileId)],
      ["Alasan", payload.reason],
      ...(payload.toJobDescription
        ? [["Keterangan jabatan", payload.toJobDescription] as [string, string]]
        : []),
    ];
  }

  return [
    ["Kategori alasan", REASON_LABEL[payload.reasonCategory]],
    ["Tanggal terakhir bekerja", payload.lastWorkingDate],
    ...(payload.handoverTo
      ? [["Serah terima kepada", payload.handoverTo] as [string, string]]
      : []),
    ["Tindakan", "Nonaktifkan dan karantina akun — bukan hapus permanen"],
  ];
}

function rowsToHtml(rows: Array<[string, string]>): string {
  return rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#44607f;font-size:13px;vertical-align:top">${escapeHtml(label)}</td>` +
        `<td style="padding:6px 0;font-size:13px;font-weight:600">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
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
          // The card and the link have to say the same things; enriching one
          // and not the other is how two versions of a request start existing.
          ...(payload.payload
            ? payloadRows(payload.payload).map(([title, value]) => ({ title, value }))
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
${
  payload.payload
    ? `<p style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#44607f">Isi pengajuan</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:20px;border-top:1px solid #d5e0ee">${rowsToHtml(payloadRows(payload.payload))}</table>`
    : ""
}
<table role="presentation" style="border-collapse:collapse"><tr>
<td style="padding-right:10px"><a href="${escapeHtml(`${decisionUrl}?putusan=setuju`)}" style="display:inline-block;background:#1f8f4e;color:#ffffff;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px">Setujui</a></td>
<td><a href="${escapeHtml(`${decisionUrl}?putusan=tolak`)}" style="display:inline-block;background:#ffffff;color:#b3261e;font-weight:600;text-decoration:none;padding:11px 23px;border-radius:8px;font-size:14px;border:1px solid #b3261e">Tolak</a></td>
</tr></table>
<p style="margin:20px 0 0;font-size:12px;color:#44607f;line-height:1.6"><strong>Setujui</strong> langsung tercatat begitu Anda menekannya — tab yang terbuka hanya menampilkan hasilnya. <strong>Tolak</strong> membuka satu kotak alasan, karena alasannya wajib dan pemohon membacanya.</p>
<p style="margin:10px 0 0;font-size:12px;color:#44607f;line-height:1.6">Tautan ini sekali pakai dan memiliki masa berlaku. Belum ada perubahan apa pun pada akun — perubahan baru dijalankan setelah kedua persetujuan masuk dan hasilnya diverifikasi.</p>`;

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
