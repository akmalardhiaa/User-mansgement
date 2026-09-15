import { getAccount } from "@/lib/accounts/service";
import { approvalFailure } from "@/lib/approval/http";
import { approveAsUser } from "@/lib/approval/service";
import { verifyToken } from "@/lib/auth/guard";
import { fail, ok } from "@/lib/http/apiResponse";
import { clientKey, rateLimit } from "@/lib/http/rateLimit";

export const dynamic = "force-dynamic";

/**
 * POST /api/my-approvals/[requestId]/approve
 *
 * The signed-in person approves the step that names them. There is no role in
 * the body to trust: the service works out whether this account is the
 * manager or the CISO of the request's current step, and refuses otherwise.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/my-approvals/[requestId]/approve">) {
  const guarded = await verifyToken(request);
  if (!guarded.ok) return guarded.response;

  const limit = rateLimit(clientKey(request, "my-approvals-decide"), 30, 15 * 60 * 1000);
  if (!limit.allowed) {
    return fail("Terlalu banyak percobaan. Coba lagi nanti.", 429, { retryAfter: limit.retryAfter });
  }

  const { requestId } = await ctx.params;
  try {
    const me = await getAccount(guarded.user.sub);
    if (!me) return fail("Akun tidak ditemukan. Silakan masuk lagi.", 401);
    return ok(await approveAsUser(requestId, me.email));
  } catch (error) {
    return approvalFailure(error, "my-approvals:approve");
  }
}
