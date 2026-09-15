import { getAccount } from "@/lib/accounts/service";
import { approvalFailure } from "@/lib/approval/http";
import { createApprovalRequest } from "@/lib/approval/service";
import { requireAdmin } from "@/lib/auth/guard";
import { isEmailDeliveryConfigured } from "@/lib/config/authEnv";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { clientKey, rateLimit } from "@/lib/http/rateLimit";
import { parseRegisterWithApprovalInput } from "@/lib/validation/approvalInput";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/register-with-approval
 *
 * Admin (HC) only. The manager and CISO addresses are typed into this form, so
 * whoever submits it chooses who approves. Leaving it public would let anyone
 * create an account and name themselves as both approvers.
 */
export async function POST(request: Request) {
  const guarded = await requireAdmin(request);
  if (!guarded.ok) return guarded.response;

  const limit = rateLimit(clientKey(request, "register-with-approval"), 30, 60 * 60 * 1000);
  if (!limit.allowed) {
    return fail("Terlalu banyak pengajuan. Coba lagi nanti.", 429, { retryAfter: limit.retryAfter });
  }

  const parsed = parseRegisterWithApprovalInput(await readJson(request));
  if (!parsed.ok) {
    return fail("Perbaiki isian yang ditandai.", 422, { fieldErrors: parsed.errors });
  }

  try {
    // Name and email come from the account as it is now, not from the session
    // token. A token is a snapshot from sign-in and is renewed with the same
    // claims, so a renamed admin would otherwise keep appearing in approval
    // emails under the old name for as long as they stayed signed in.
    const requester = await getAccount(guarded.user.sub);
    if (!requester) return fail("Akun HC tidak ditemukan. Silakan masuk lagi.", 401);

    const { requestId, status } = await createApprovalRequest(parsed.value, {
      id: requester.id,
      name: requester.fullName,
      email: requester.email,
    });
    // Says whether the manager's email really left, so the form never reports
    // "sent" for a message that was only written to the server log.
    const emailDelivery = isEmailDeliveryConfigured() ? "sent" : "logged";
    return ok({ message: "User created, awaiting approvals", requestId, status, emailDelivery }, 201);
  } catch (error) {
    return approvalFailure(error, "register-with-approval");
  }
}
