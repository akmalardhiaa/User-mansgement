import { getBrand } from "@/lib/config/brand";
import type { AccessRequest, Employee } from "@/lib/types";

import type { RenderedEmail } from "./templates";

/**
 * The approval request a manager receives.
 *
 * Built as an inline-styled table for the same reason as the other templates:
 * Gmail strips `<style>` from the head and Outlook renders through Word.
 *
 * The message states the whole request in the body rather than only linking to
 * it. A manager reading this on a phone should be able to tell what they are
 * approving without opening anything, because the ones who cannot usually
 * approve it anyway.
 */

const INK = "#0f172a";
const MUTED = "#64748b";
const ACCENT = "#1d4ed8";
const BORDER = "#e2e8f0";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface Row {
  label: string;
  value: string;
}

/** What the manager is being asked about, by request type. */
function describe(employee: Employee, request: AccessRequest): { heading: string; intro: string; rows: Row[] } {
  const base: Row[] = [
    { label: "Nama", value: employee.displayName },
    { label: "Email", value: employee.email },
  ];

  if (request.type === "TRANSFER") {
    return {
      heading: "Permintaan pindah divisi",
      intro: `Human Capital mengajukan pemindahan divisi untuk ${employee.displayName}. Mohon setujui atau tolak.`,
      rows: [
        ...base,
        { label: "Posisi saat ini", value: `${employee.jobTitle} — ${employee.department}` },
        {
          label: "Posisi tujuan",
          value: request.transfer
            ? `${request.transfer.jobTitle} — ${request.transfer.department}`
            : "—",
        },
        { label: "Alasan", value: request.reason || "—" },
      ],
    };
  }

  if (request.type === "OFFBOARDING") {
    return {
      heading: "Permintaan penonaktifan akun",
      intro: `Human Capital mengajukan penonaktifan akun ${employee.displayName}. Mohon setujui atau tolak.`,
      rows: [
        ...base,
        { label: "Posisi", value: `${employee.jobTitle} — ${employee.department}` },
        { label: "Alasan", value: request.reason || "—" },
      ],
    };
  }

  return {
    heading: "Permintaan pembuatan akun baru",
    intro: `Human Capital mengajukan pembuatan akun baru untuk ${employee.displayName}. Mohon setujui atau tolak.`,
    rows: [
      ...base,
      { label: "Jabatan", value: employee.jobTitle },
      { label: "Departemen", value: employee.department },
      ...(employee.jobDescription
        ? [{ label: "Keterangan jabatan", value: employee.jobDescription }]
        : []),
    ],
  };
}

export function managerApprovalEmail(
  employee: Employee,
  request: AccessRequest,
  url: string,
  expiresAt: Date,
): RenderedEmail {
  const brand = getBrand().name;
  const { heading, intro, rows } = describe(employee, request);

  const deadline = expiresAt.toLocaleString("id-ID", {
    dateStyle: "full",
    timeStyle: "short",
  });

  const footnote = `Tautan ini berlaku sampai ${deadline} dan hanya bisa dipakai sekali. Jika Anda merasa tidak berkepentingan dengan permintaan ini, abaikan saja — tanpa keputusan Anda, akses tidak akan diberikan.`;

  const rowsHtml = rows
    .map(
      ({ label, value }) => `
          <tr>
            <td style="padding:7px 0;font-size:13px;color:${MUTED};width:38%;vertical-align:top;">${escapeHtml(label)}</td>
            <td style="padding:7px 0;font-size:14px;color:${INK};font-weight:600;">${escapeHtml(value)}</td>
          </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(intro)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid ${BORDER};border-radius:14px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <tr>
            <td style="padding:28px 32px 0 32px;">
              <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};">${escapeHtml(brand)} · Human Capital</p>
              <h1 style="margin:14px 0 0 0;font-size:21px;line-height:1.3;color:${INK};">${escapeHtml(heading)}</h1>
              <p style="margin:12px 0 0 0;font-size:15px;line-height:1.6;color:${INK};">${escapeHtml(intro)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${BORDER};border-bottom:1px solid ${BORDER};">
                ${rowsHtml}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 0 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:9px;background:${ACCENT};">
                    <a href="${url}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:9px;">Buka halaman persetujuan</a>
                  </td>
                </tr>
              </table>
              <p style="margin:12px 0 0 0;font-size:13px;line-height:1.6;color:${MUTED};">
                Anda akan diminta memilih <strong style="color:${INK};">Setujui</strong> atau
                <strong style="color:${INK};">Tolak</strong> di halaman tersebut.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 0 32px;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED};">
                Jika tombol tidak berfungsi, salin tautan ini:<br>
                <span style="word-break:break-all;color:${ACCENT};">${escapeHtml(url)}</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 32px 30px 32px;">
              <p style="margin:0;padding-top:18px;border-top:1px solid ${BORDER};font-size:12px;line-height:1.6;color:${MUTED};">${escapeHtml(footnote)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    intro,
    "",
    ...rows.map(({ label, value }) => `${label}: ${value}`),
    "",
    "Buka halaman berikut untuk menyetujui atau menolak:",
    url,
    "",
    footnote,
  ].join("\n");

  return { subject: `[Persetujuan] ${heading} — ${employee.displayName}`, html, text };
}
