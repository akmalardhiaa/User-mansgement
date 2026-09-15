import { getAccount } from "@/lib/accounts/service";
import { approvalFailure } from "@/lib/approval/http";
import { listMyApprovals } from "@/lib/approval/service";
import { verifyToken } from "@/lib/auth/guard";
import { fail, ok } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

/**
 * GET /api/my-approvals — requests waiting on the signed-in person.
 *
 * Matched by the address on the account as it is now, not the one in the
 * session token, so an approver whose email was corrected sees the right list
 * without signing out.
 */
export async function GET(request: Request) {
  const guarded = await verifyToken(request);
  if (!guarded.ok) return guarded.response;

  try {
    const me = await getAccount(guarded.user.sub);
    if (!me) return fail("Akun tidak ditemukan. Silakan masuk lagi.", 401);
    return ok({ requests: await listMyApprovals(me.email) });
  } catch (error) {
    return approvalFailure(error, "my-approvals:list");
  }
}
