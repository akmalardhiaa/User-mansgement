import { getBrand } from "@/lib/config/brand";

/**
 * Email templates.
 *
 * Written as inline-styled tables because that is what mail clients actually
 * render: Gmail strips <style> blocks from the head, Outlook's Word renderer
 * ignores most of flexbox and grid, and several clients drop background images.
 * Every message ships a text/plain alternative too — some clients prefer it,
 * and a link that only exists inside HTML is unreachable for anyone reading in
 * plain text.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const BRAND_INK = "#0f172a";
const BRAND_MUTED = "#64748b";
const BRAND_ACCENT = "#1d4ed8";
const BRAND_BORDER = "#e2e8f0";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface LayoutOptions {
  heading: string;
  intro: string;
  ctaLabel: string;
  ctaUrl: string;
  footnote: string;
}

/** Shared shell so both messages look like they come from the same system. */
function layout({ heading, intro, ctaLabel, ctaUrl, footnote }: LayoutOptions): string {
  const brand = escapeHtml(getBrand().name);
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <!-- Preheader: the grey line clients show next to the subject in the inbox. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(intro)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border:1px solid ${BRAND_BORDER};border-radius:14px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <tr>
            <td style="padding:28px 32px 0 32px;">
              <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_MUTED};">${brand}</p>
              <h1 style="margin:14px 0 0 0;font-size:22px;line-height:1.3;color:${BRAND_INK};">${escapeHtml(heading)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 0 32px;">
              <p style="margin:0;font-size:15px;line-height:1.6;color:${BRAND_INK};">${escapeHtml(intro)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 0 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:9px;background:${BRAND_ACCENT};">
                    <a href="${ctaUrl}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:9px;">${escapeHtml(ctaLabel)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 32px 0 32px;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND_MUTED};">
                Jika tombol di atas tidak berfungsi, salin tautan ini ke peramban Anda:<br>
                <span style="word-break:break-all;color:${BRAND_ACCENT};">${escapeHtml(ctaUrl)}</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 32px 30px 32px;">
              <p style="margin:0;padding-top:18px;border-top:1px solid ${BRAND_BORDER};font-size:12px;line-height:1.6;color:${BRAND_MUTED};">${escapeHtml(footnote)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function verificationEmail(fullName: string, url: string, token: string): RenderedEmail {
  const brand = getBrand().name;
  const intro = `Halo ${fullName}, akun Anda di ${brand} sudah dibuat. Satu langkah lagi: konfirmasi alamat email ini supaya Anda bisa masuk.`;
  const footnote =
    "Tautan ini berlaku 24 jam. Jika Anda tidak merasa mendaftar, abaikan email ini — tanpa konfirmasi, akun tersebut tidak bisa digunakan.";

  return {
    subject: `Konfirmasi email Anda — ${brand}`,
    html: layout({
      heading: "Konfirmasi alamat email Anda",
      intro,
      ctaLabel: "Konfirmasi email",
      ctaUrl: url,
      footnote,
    }),
    text: [
      intro,
      "",
      "Buka tautan berikut untuk mengonfirmasi:",
      url,
      "",
      `Kode verifikasi: ${token}`,
      "",
      footnote,
    ].join("\n"),
  };
}

export function passwordResetEmail(fullName: string, url: string, token: string): RenderedEmail {
  const brand = getBrand().name;
  const intro = `Halo ${fullName}, kami menerima permintaan untuk mengatur ulang kata sandi akun ${brand} Anda.`;
  const footnote =
    "Tautan ini berlaku 1 jam dan hanya bisa dipakai sekali. Jika Anda tidak meminta pengaturan ulang, abaikan email ini — kata sandi Anda tidak berubah.";

  return {
    subject: `Atur ulang kata sandi — ${brand}`,
    html: layout({
      heading: "Atur ulang kata sandi",
      intro,
      ctaLabel: "Atur ulang kata sandi",
      ctaUrl: url,
      footnote,
    }),
    text: [
      intro,
      "",
      "Buka tautan berikut untuk memilih kata sandi baru:",
      url,
      "",
      `Kode reset: ${token}`,
      "",
      footnote,
    ].join("\n"),
  };
}
