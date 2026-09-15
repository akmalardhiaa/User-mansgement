import { approvalFailure } from "@/lib/approval/http";
import { approve } from "@/lib/approval/service";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { clientKey, rateLimit } from "@/lib/http/rateLimit";
import { parseDecisionInput } from "@/lib/validation/approvalInput";

export const dynamic = "force-dynamic";

/**
 * POST /api/approval/approve — { token, approvingRole }.
 *
 * approvingRole must match the role the token was issued for; the server works
 * that out from the token and refuses a mismatch, so a manager link cannot be
 * replayed as the CISO's approval.
 */
export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, "approval-decide"), 20, 15 * 60 * 1000);
  if (!limit.allowed) {
    return fail("Terlalu banyak percobaan. Coba lagi nanti.", 429, { retryAfter: limit.retryAfter });
  }

  const parsed = parseDecisionInput(await readJson(request), false);
  if (!parsed.ok) return fail("Permintaan tidak lengkap.", 422, { fieldErrors: parsed.errors });

  try {
    return ok(await approve(parsed.value.token, parsed.value.approvingRole));
  } catch (error) {
    return approvalFailure(error, "approval:approve");
  }
}
