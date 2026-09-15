import { getBrand } from "@/lib/config/brand";

import type { RenderedEmail } from "./templates";

/**
 * The four emails of the account approval workflow.
 *
 * Built as inline-styled tables because that is what mail clients render:
 * Gmail strips <style> from the head and Outlook lays out through Word. Every
 * message also carries a plain-text body, since a link that exists only inside
 * HTML is unreachable for anyone reading in text mode.
 *
 * Buttons never act on their own. "Setujui" and "Tolak" both open the decision
 * page, which asks for a click there: mail scanners follow every link in a
 * message, and a link that approved on arrival would be approved by a scanner.
 */

const NAVY = "#0b1f3a";
const GOLD = "#d4a53a";
const INK = "#0f172a";
const MUTED = "#5b6b82";
const LINE = "#e3e8ef";
const GROUND = "#f2f4f7";
const OK = "#15803d";
const DANGER = "#b42318";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(date: Date): string {
  return date.toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" });
}

type Row = [label: string, value: string];

function detailTable(rows: Row[]): string {
  const body = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:9px 0;border-bottom:1px solid ${LINE};font-size:13px;color:${MUTED};width:40%;vertical-align:top;">${esc(label)}</td>
          <td style="padding:9px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${INK};font-weight:600;">${esc(value)}</td>
        </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${LINE};">${body}</table>`;
}

function button(label: string, url: string, tone: "primary" | "danger" | "ok"): string {
  const solid = tone === "danger" ? "#ffffff" : tone === "ok" ? OK : NAVY;
  const text = tone === "danger" ? DANGER : "#ffffff";
  const border = tone === "danger" ? DANGER : solid;
  return `<td style="padding:0 10px 10px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="border-radius:8px;background:${solid};border:1.5px solid ${border};">
          <a href="${url}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:700;letter-spacing:0.02em;color:${text};text-decoration:none;border-radius:8px;">${esc(label)}</a>
        </td>
      </tr></table>
    </td>`;
}

interface Shell {
  preheader: string;
  eyebrow: string;
  heading: string;
  intro: string;
  body: string;
  footnote: string;
}

function shell({ preheader, eyebrow, heading, intro, body, footnote }: Shell): string {
  const brand = esc(getBrand().name);
  return `<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:${GROUND};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${GROUND};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="background:${NAVY};padding:20px 32px;border-bottom:3px solid ${GOLD};">
          <p style="margin:0;font-size:15px;font-weight:700;color:#ffffff;">${brand}</p>
          <p style="margin:3px 0 0 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${GOLD};">Human Capital · User Management</p>
        </td></tr>
        <tr><td style="padding:28px 32px 0 32px;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};">${esc(eyebrow)}</p>
          <h1 style="margin:8px 0 0 0;font-size:21px;line-height:1.3;color:${INK};">${esc(heading)}</h1>
          <p style="margin:12px 0 0 0;font-size:15px;line-height:1.6;color:${INK};">${intro}</p>
        </td></tr>
        <tr><td style="padding:20px 32px 0 32px;">${body}</td></tr>
        <tr><td style="padding:24px 32px 28px 32px;">
          <p style="margin:0;padding-top:16px;border-top:1px solid ${LINE};font-size:12px;line-height:1.6;color:${MUTED};">${esc(footnote)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function linkFallback(approveUrl: string, rejectUrl: string): string {
  return `<p style="margin:14px 0 0 0;font-size:12px;line-height:1.6;color:${MUTED};">
    Jika tombol tidak berfungsi, salin tautan berikut:<br>
    Setujui: <span style="word-break:break-all;color:${NAVY};">${esc(approveUrl)}</span><br>
    Tolak: <span style="word-break:break-all;color:${DANGER};">${esc(rejectUrl)}</span>
  </p>`;
}

/* ---------------------------------------------------------------- 1 */

export interface ManagerRequestInput {
  employeeName: string;
  email: string;
  department: string;
  notes?: string | null;
  managerName: string;
  requesterName: string;
  approveUrl: string;
  rejectUrl: string;
  expiresIn: string;
}

export function managerApprovalRequestEmail(input: ManagerRequestInput): RenderedEmail {
  const rows: Row[] = [
    ["Nama karyawan", input.employeeName],
    ["Email", input.email],
    ["Departemen", input.department],
    ["Diajukan oleh", `${input.requesterName} (HC)`],
    ...(input.notes ? ([["Keterangan", input.notes]] as Row[]) : []),
  ];
  const footnote = `Tautan berlaku ${input.expiresIn} dan hanya bisa dipakai sekali. Setelah Anda menyetujui, permintaan diteruskan ke CISO / IT Security.`;

  return {
    subject: `Persetujuan User Baru: ${input.employeeName} - ${input.department}`,
    html: shell({
      preheader: `${input.employeeName} menunggu persetujuan Anda.`,
      eyebrow: "Langkah 2 dari 4 · Persetujuan manager",
      heading: "Persetujuan user baru",
      intro: `Halo ${esc(input.managerName)}, Human Capital mengajukan akun baru untuk <strong>${esc(input.employeeName)}</strong>. Mohon tinjau dan berikan keputusan Anda.`,
      body: `${detailTable(rows)}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;"><tr>
          ${button("SETUJUI", input.approveUrl, "ok")}
          ${button("TOLAK", input.rejectUrl, "danger")}
        </tr></table>
        ${linkFallback(input.approveUrl, input.rejectUrl)}`,
      footnote,
    }),
    text: [
      `Halo ${input.managerName},`,
      "",
      `Human Capital mengajukan akun baru untuk ${input.employeeName}.`,
      "",
      ...rows.map(([l, v]) => `${l}: ${v}`),
      "",
      `SETUJUI: ${input.approveUrl}`,
      `TOLAK:   ${input.rejectUrl}`,
      "",
      footnote,
    ].join("\n"),
  };
}

/* ---------------------------------------------------------------- 2 */

export interface CisoRequestInput {
  employeeName: string;
  email: string;
  department: string;
  cisoName: string;
  managerName: string;
  managerApprovedAt: Date;
  approveUrl: string;
  rejectUrl: string;
  expiresIn: string;
}

export function cisoApprovalRequestEmail(input: CisoRequestInput): RenderedEmail {
  const rows: Row[] = [
    ["Nama karyawan", input.employeeName],
    ["Email", input.email],
    ["Departemen", input.department],
  ];
  const approval = `Disetujui oleh ${input.managerName} pada ${formatDate(input.managerApprovedAt)}`;
  const footnote = `Tautan ini khusus untuk CISO / IT Security, berlaku ${input.expiresIn}, dan hanya bisa dipakai sekali. Setelah disetujui, akun langsung aktif.`;

  return {
    subject: `Persetujuan Account IT: ${input.employeeName}`,
    html: shell({
      preheader: `Manager sudah menyetujui ${input.employeeName}. Menunggu keputusan IT Security.`,
      eyebrow: "Langkah 3 dari 4 · Persetujuan IT Security",
      heading: "Persetujuan account IT",
      intro: `Halo ${esc(input.cisoName)}, manager sudah menyetujui akun untuk <strong>${esc(input.employeeName)}</strong>. Keputusan Anda adalah langkah terakhir sebelum akun aktif.`,
      body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;"><tr>
          <td style="background:#ecfdf3;border:1px solid #abefc6;border-radius:8px;padding:11px 14px;font-size:13px;color:${OK};">✓ ${esc(approval)}</td>
        </tr></table>
        ${detailTable(rows)}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;"><tr>
          ${button("SETUJUI", input.approveUrl, "ok")}
          ${button("TOLAK", input.rejectUrl, "danger")}
        </tr></table>
        ${linkFallback(input.approveUrl, input.rejectUrl)}`,
      footnote,
    }),
    text: [
      `Halo ${input.cisoName},`,
      "",
      approval,
      "",
      ...rows.map(([l, v]) => `${l}: ${v}`),
      "",
      `SETUJUI: ${input.approveUrl}`,
      `TOLAK:   ${input.rejectUrl}`,
      "",
      footnote,
    ].join("\n"),
  };
}

/* ---------------------------------------------------------------- 3 */

export interface AccountActiveInput {
  employeeName: string;
  email: string;
  department: string;
  loginUrl: string;
}

export function accountActiveEmail(input: AccountActiveInput): RenderedEmail {
  const rows: Row[] = [
    ["Email login", input.email],
    ["Departemen", input.department],
  ];
  const footnote =
    "Gunakan kata sandi yang diberikan oleh HC saat akun diajukan, lalu segera ganti melalui menu Profil.";

  return {
    subject: "Selamat! Akun Anda Sudah Aktif",
    html: shell({
      preheader: "Akun Anda sudah disetujui dan siap digunakan.",
      eyebrow: "Langkah 4 dari 4 · Akun aktif",
      heading: "Akun Anda sudah aktif",
      intro: `Halo ${esc(input.employeeName)}, akun Anda sudah disetujui oleh manager dan CISO / IT Security, dan sekarang siap digunakan.`,
      body: `${detailTable(rows)}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;"><tr>
          ${button("MASUK SEKARANG", input.loginUrl, "primary")}
        </tr></table>`,
      footnote,
    }),
    text: [
      `Halo ${input.employeeName},`,
      "",
      "Akun Anda sudah disetujui dan siap digunakan.",
      "",
      ...rows.map(([l, v]) => `${l}: ${v}`),
      "",
      `Masuk: ${input.loginUrl}`,
      "",
      footnote,
    ].join("\n"),
  };
}

/* ---------------------------------------------------------------- 4 */

export interface RejectionInput {
  employeeName: string;
  email: string;
  department: string;
  requesterName: string;
  rejectedByName: string;
  rejectedByRole: string;
  reason: string;
  rejectedAt: Date;
}

export function rejectionEmail(input: RejectionInput): RenderedEmail {
  const rows: Row[] = [
    ["Nama karyawan", input.employeeName],
    ["Email", input.email],
    ["Departemen", input.department],
    ["Ditolak oleh", `${input.rejectedByName} (${input.rejectedByRole})`],
    ["Waktu", formatDate(input.rejectedAt)],
  ];
  const footnote =
    "Akun ini tidak diaktifkan. Untuk mengajukan ulang, hapus akun tersebut dari menu Kelola akun lalu buat pengajuan baru.";

  return {
    subject: "Permohonan User Ditolak",
    html: shell({
      preheader: `Permohonan akun ${input.employeeName} ditolak.`,
      eyebrow: "Permohonan ditolak",
      heading: "Permohonan user ditolak",
      intro: `Halo ${esc(input.requesterName)}, permohonan akun untuk <strong>${esc(input.employeeName)}</strong> ditolak.`,
      body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;"><tr>
          <td style="background:#fef3f2;border:1px solid #fecdca;border-radius:8px;padding:12px 14px;">
            <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${DANGER};">Alasan penolakan</p>
            <p style="margin:6px 0 0 0;font-size:14px;line-height:1.55;color:${INK};">${esc(input.reason)}</p>
          </td>
        </tr></table>
        ${detailTable(rows)}`,
      footnote,
    }),
    text: [
      `Halo ${input.requesterName},`,
      "",
      `Permohonan akun untuk ${input.employeeName} ditolak.`,
      "",
      `Alasan: ${input.reason}`,
      "",
      ...rows.map(([l, v]) => `${l}: ${v}`),
      "",
      footnote,
    ].join("\n"),
  };
}
