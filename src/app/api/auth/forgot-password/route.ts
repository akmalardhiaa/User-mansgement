import { requestPasswordReset } from "@/lib/accounts/service";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { preflight, withCors } from "@/lib/http/cors";
import { clientKey, rateLimit } from "@/lib/http/rateLimit";
import { parseEmailInput } from "@/lib/validation/accountInput";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/** Said for every well-formed address, whether or not an account exists. */
const NEUTRAL_MESSAGE =
  "Jika email tersebut terdaftar, kami sudah mengirim tautan untuk mengatur ulang kata sandi.";

/**
 * POST /api/auth/forgot-password
 *
 * Always answers the same way. An honest "no such account" would turn this
 * public form into a way to test which addresses are registered, one request
 * at a time — so the response does not depend on whether the lookup found
 * anyone, and neither does its timing in any way the caller can rely on.
 */
export async function POST(request: Request) {
  // Sending mail to an address the caller chose is the expensive side effect
  // here, so the limit is tighter than on the other routes.
  const limit = rateLimit(clientKey(request, "forgot-password"), 5, 15 * 60 * 1000);
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
    await requestPasswordReset(parsed.value.email);
  } catch (error) {
    // Logged, not surfaced. Reporting a mail failure here would answer the
    // very question this route exists to avoid answering.
    console.error("[auth/forgot-password]", error);
  }

  return withCors(ok({ message: NEUTRAL_MESSAGE }), request);
}
