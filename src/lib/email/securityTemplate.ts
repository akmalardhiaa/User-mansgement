import { getBrand } from "@/lib/config/brand";
import type { AccessRequest, Employee } from "@/lib/types";

import type { RenderedEmail } from "./templates";

/**
 * The provisioning request the security team receives.
 *
 * Reads as a work order rather than a notification: the person opening it has
 * to act on it, so the checklist is in the body, the approval that authorised
 * it is named, and the single action — "sudah selesai" — is one link away.
 *
 * Inline-styled tables for the same reason as the other templates: Gmail
 * strips `<style>` from the head and Outlook renders through Word.
 */

const INK = "#0f172a";
const MUTED = "#64748b";
const ACCENT = "#0369a1";
const BORDER = "#e2e8f0";
const WARN_BG = "#fdf6e6";
const WARN_INK = "#92400e";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface Spec {
  heading: string;
  intro: string;
  checklist: string[];
  rows: Array<[string, string]>;
  outcome: string;
}

function describe(employee: Employee, request: AccessRequest): Spec {
  const identity: Array<[string, string]> = [
    ["Nama", employee.displayName],
    ["Email", employee.email],
  ];

  if (request.type === "TRANSFER") {
    return {
      heading: "Penyesuaian akses — pindah divisi",
      intro: `${employee.displayName} pindah divisi. Mohon sesuaikan akun dan aksesnya.`,
      rows: [
        ...identity,
        ["Posisi lama", `${employee.jobTitle} — ${employee.department}`],
        [
          "Posisi baru",
          request.transfer ? `${request.transfer.jobTitle} — ${request.transfer.department}` : "—",
        ],
      ],
      checklist: [
        "Cabut role dan grup divisi lama",
        "Berikan role dan grup divisi baru",
        "Sesuaikan akses aplikasi dan folder bersama",
        "Perbarui atasan di direktori",
      ],
      outcome: `Setelah ditandai selesai, dashboard HC otomatis memindahkan ${employee.displayName} ke divisi barunya.`,
    };
  }

  if (request.type === "OFFBOARDING") {
    return {
      heading: "Pencabutan akses — penonaktifan akun",
      intro: `${employee.displayName} keluar. Mohon cabut akun dan seluruh aksesnya.`,
      rows: [...identity, ["Posisi", `${employee.jobTitle} — ${employee.department}`]],
      checklist: [
        "Nonaktifkan akun direktori",
        "Cabut pendaftaran SSO dan profil VPN",
        "Hentikan penerusan mailbox",
        "Cabut seluruh role aplikasi",
        "Tarik perangkat yang dipinjamkan",
      ],
      outcome: `Setelah ditandai selesai, status ${employee.displayName} otomatis menjadi Dinonaktifkan.`,
    };
  }

  return {
    heading: "Penyiapan akses — karyawan baru",
    intro: `${employee.displayName} bergabung. Mohon siapkan akun dan akses dasarnya.`,
    rows: [
      ...identity,
      ["Jabatan", employee.jobTitle],
      ["Departemen", employee.department],
      ...(employee.locationType
        ? ([
            [
              "Lokasi",
              employee.locationType === "CABANG"
                ? `Cabang${employee.branchName ? ` — ${employee.branchName}` : ""}`
                : "Pusat",
            ],
          ] as Array<[string, string]>)
        : []),
    ],
    checklist: [
      "Akun direktori",
      "Mailbox email",
      "Pendaftaran SSO",
      "Profil VPN",
      "Role aplikasi dasar sesuai departemen",
    ],
    outcome: `Setelah ditandai selesai, status ${employee.displayName} otomatis menjadi Aktif di dashboard HC.`,
  };
}

export function securityProvisioningEmail(
  employee: Employee,
  request: AccessRequest,
  url: string,
  expiresAt: Date,
  teamName: string,
  approvedBy?: string,
): RenderedEmail {
  const brand = getBrand().name;
  const { heading, intro, rows, checklist, outcome } = describe(employee, request);

  const deadline = expiresAt.toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" });
  const authorisation = approvedBy
    ? `Permintaan ini sudah disetujui oleh ${approvedBy}.`
    : "Permintaan ini sudah melewati persetujuan manager.";

  const footnote = `Tautan ini berlaku sampai ${deadline} dan hanya bisa dipakai sekali. Jangan teruskan email ini ke luar tim — tautannya adalah kuncinya.`;

  const rowsHtml = rows
    .map(
      ([label, value]) => `
          <tr>
            <td style="padding:7px 0;font-size:13px;color:${MUTED};width:36%;vertical-align:top;">${escapeHtml(label)}</td>
            <td style="padding:7px 0;font-size:14px;color:${INK};font-weight:600;">${escapeHtml(value)}</td>
          </tr>`,
    )
    .join("");

  const checklistHtml = checklist
    .map(
      (item) =>
        `<li style="margin:0 0 6px 0;font-size:14px;line-height:1.5;color:${INK};">${escapeHtml(item)}</li>`,
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
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;background:#ffffff;border:1px solid ${BORDER};border-radius:14px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <tr>
            <td style="padding:28px 32px 0 32px;">
              <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};">${escapeHtml(brand)} · ${escapeHtml(teamName)}</p>
              <h1 style="margin:14px 0 0 0;font-size:21px;line-height:1.3;color:${INK};">${escapeHtml(heading)}</h1>
              <p style="margin:12px 0 0 0;font-size:15px;line-height:1.6;color:${INK};">${escapeHtml(intro)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${WARN_BG};border-radius:9px;">
                <tr>
                  <td style="padding:11px 14px;font-size:13px;line-height:1.5;color:${WARN_INK};">${escapeHtml(authorisation)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${BORDER};border-bottom:1px solid ${BORDER};">
                ${rowsHtml}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 0 32px;">
              <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${MUTED};">Yang perlu disiapkan</p>
              <ul style="margin:0;padding-left:20px;">${checklistHtml}</ul>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 0 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:9px;background:${ACCENT};">
                    <a href="${url}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:9px;">Buka halaman penyiapan</a>
                  </td>
                </tr>
              </table>
              <p style="margin:12px 0 0 0;font-size:13px;line-height:1.6;color:${MUTED};">${escapeHtml(outcome)}</p>
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
    authorisation,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Yang perlu disiapkan:",
    ...checklist.map((item) => `- ${item}`),
    "",
    "Buka halaman berikut untuk menandai selesai:",
    url,
    "",
    outcome,
    "",
    footnote,
  ].join("\n");

  return { subject: `[${teamName}] ${heading} — ${employee.displayName}`, html, text };
}
