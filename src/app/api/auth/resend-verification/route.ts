import { resendVerification } from "@/lib/accounts/service";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { preflight, withCors } from "@/lib/http/cors";
import { clientKey, rateLimit } from "@/lib/http/rateLimit";
import { parseEmailInput } from "@/lib/validation/accountInput";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/** Same wording for every address, for the same reason as forgot-password. */
const NEUTRAL_MESSAGE =
  "Jika akun tersebut ada dan belum dikonfirmasi, kami sudah mengirim tautan konfirmasi baru.";

/**
 * POST /api/auth/resend-verification
 *
 * Not in the original spec, but the flow needs it: a 24-hour link that expires
 * before anyone opens it would otherwise leave an account permanently stranded
 * — unable to sign in, and with no way to ask for a new link.
 */
export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, "resend-verification"), 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    return withCors(
      fail("Terlalu banyak permintaan. Coba lagi nanti.", 429, { retryAfter: limit.retryAfter }),
      request,
    );
  }

  const parsed = parseEmailInput(await readJson(request));
  if (!parsed.ok) {
    return withCors(fail("Masukkan alamat email yang valid.", 422, { fieldErrors: parsed.errors }), request);
  }

  try {
    await resendVerification(parsed.value.email);
  } catch (error) {
    console.error("[auth/resend-verification]", error);
  }

  return withCors(ok({ message: NEUTRAL_MESSAGE }), request);
}
