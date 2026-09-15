import { getAccount } from "@/lib/accounts/service";
import { approvalFailure } from "@/lib/approval/http";
import { rejectAsUser } from "@/lib/approval/service";
import { verifyToken } from "@/lib/auth/guard";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { clientKey, rateLimit } from "@/lib/http/rateLimit";

export const dynamic = "force-dynamic";

/** POST /api/my-approvals/[requestId]/reject — { reason }. */
export async function POST(request: Request, ctx: RouteContext<"/api/my-approvals/[requestId]/reject">) {
  const guarded = await verifyToken(request);
  if (!guarded.ok) return guarded.response;

  const limit = rateLimit(clientKey(request, "my-approvals-decide"), 30, 15 * 60 * 1000);
  if (!limit.allowed) {
    return fail("Terlalu banyak percobaan. Coba lagi nanti.", 429, { retryAfter: limit.retryAfter });
  }

  const body = (await readJson(request)) as { reason?: unknown } | undefined;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 5 || reason.length > 1000) {
    return fail("Perbaiki isian yang ditandai.", 422, {
      fieldErrors: { reason: "Tuliskan alasan penolakan (5–1000 karakter)." },
    });
  }

  const { requestId } = await ctx.params;
  try {
    const me = await getAccount(guarded.user.sub);
    if (!me) return fail("Akun tidak ditemukan. Silakan masuk lagi.", 401);
    return ok(await rejectAsUser(requestId, me.email, reason));
  } catch (error) {
    return approvalFailure(error, "my-approvals:reject");
  }
}
