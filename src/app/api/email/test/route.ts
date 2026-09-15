import { requireAdmin } from "@/lib/auth/guard";
import { sendEmail } from "@/lib/email";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { clientKey, rateLimit } from "@/lib/http/rateLimit";

export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/email/test — { to }. Sends one real email through the configured
 * channel and reports what happened. Admin only, and rate limited, because it
 * sends mail to an address the caller chooses.
 */
export async function POST(request: Request) {
  const guarded = await requireAdmin(request);
  if (!guarded.ok) return guarded.response;

  const limit = rateLimit(clientKey(request, "email-test"), 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return fail("Terlalu banyak email tes. Coba lagi nanti.", 429, { retryAfter: limit.retryAfter });
  }

  const body = (await readJson(request)) as { to?: unknown } | undefined;
  const to = typeof body?.to === "string" ? body.to.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(to)) {
    return fail("Masukkan alamat email yang valid.", 422, { fieldErrors: { to: "Alamat email tidak valid." } });
  }

  const sent = await sendEmail({
    to,
    subject: "[HC Portal] Tes pengiriman email",
    text: "Email ini dikirim dari halaman Pengaturan email HC Portal. Kalau Anda membacanya, pengiriman email sudah berfungsi.",
    html:
      '<div style="font-family:Arial,sans-serif;font-size:15px;color:#0f172a;">' +
      "<p><strong>Tes pengiriman email berhasil.</strong></p>" +
      "<p>Email ini dikirim dari halaman Pengaturan email HC Portal. Email persetujuan akan terkirim dengan cara yang sama.</p>" +
      "</div>",
  });

  return sent.delivered
    ? ok({ delivered: true, message: `Email tes terkirim ke ${to}.` })
    : fail(`Email tes gagal dikirim: ${sent.error ?? "alasan tidak diketahui"}`, 502);
}
