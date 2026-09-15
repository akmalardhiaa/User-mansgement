import { approvalFailure } from "@/lib/approval/http";
import { reject } from "@/lib/approval/service";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { clientKey, rateLimit } from "@/lib/http/rateLimit";
import { parseDecisionInput } from "@/lib/validation/approvalInput";

export const dynamic = "force-dynamic";

/** POST /api/approval/reject — { token, approvingRole, reason }. */
export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, "approval-decide"), 20, 15 * 60 * 1000);
  if (!limit.allowed) {
    return fail("Terlalu banyak percobaan. Coba lagi nanti.", 429, { retryAfter: limit.retryAfter });
  }

  const parsed = parseDecisionInput(await readJson(request), true);
  if (!parsed.ok) return fail("Perbaiki isian yang ditandai.", 422, { fieldErrors: parsed.errors });

  try {
    return ok(await reject(parsed.value.token, parsed.value.approvingRole, parsed.value.reason!));
  } catch (error) {
    return approvalFailure(error, "approval:reject");
  }
}
