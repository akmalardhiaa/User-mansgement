import { approvalFailure } from "@/lib/approval/http";
import { getApprovalDetail } from "@/lib/approval/service";
import { requireAdmin } from "@/lib/auth/guard";
import { fail, ok } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

/** GET /api/approvals/[requestId] — one request with its audit log. Admin only. */
export async function GET(request: Request, ctx: RouteContext<"/api/approvals/[requestId]">) {
  const guarded = await requireAdmin(request);
  if (!guarded.ok) return guarded.response;

  const { requestId } = await ctx.params;
  try {
    const detail = await getApprovalDetail(requestId);
    return detail ? ok(detail) : fail("Pengajuan tidak ditemukan.", 404);
  } catch (error) {
    return approvalFailure(error, "approvals:detail");
  }
}
