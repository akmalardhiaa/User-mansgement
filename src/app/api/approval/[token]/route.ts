import { approvalFailure } from "@/lib/approval/http";
import { getApprovalByToken } from "@/lib/approval/service";
import { fail, ok } from "@/lib/http/apiResponse";
import { clientKey, rateLimit } from "@/lib/http/rateLimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/approval/[token] — what the link holder is being asked to decide.
 *
 * Public: the token is the credential. It never changes anything, which is
 * what makes it safe for mail scanners to follow.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/approval/[token]">) {
  const limit = rateLimit(clientKey(request, "approval-read"), 60, 15 * 60 * 1000);
  if (!limit.allowed) {
    return fail("Terlalu banyak permintaan. Coba lagi nanti.", 429, { retryAfter: limit.retryAfter });
  }

  const { token } = await ctx.params;
  try {
    return ok(await getApprovalByToken(token));
  } catch (error) {
    return approvalFailure(error, "approval:read");
  }
}
