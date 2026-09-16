import { lifecycleFailure } from "@/lib/lifecycle/apiError";
import { decideByToken } from "@/lib/lifecycle/service";
import { fail, ok, readJson } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

/**
 * POST /api/approval-actions — a decision made from an approval email.
 *
 * Reachable without a portal session, because the approver has a link rather
 * than necessarily an account here. That is exactly why it is a POST and why
 * opening the link does not decide anything: mail scanners and link previewers
 * follow every URL in a message, and a GET that approved would be approved by a
 * spam filter.
 *
 * What authenticates it today is the token — single use, bound to one stage of
 * one version of one request, consumed in the same transaction as the decision.
 * That proves the holder has a link which was sent to a specific mailbox. It
 * does NOT prove who they are, and the plan is explicit that the Microsoft
 * identity on the Actionable Message is what upgrades this. Until that is
 * registered, this is the agreed browser fallback and no stronger than the link.
 */
export async function POST(request: Request) {
  const body = (await readJson(request)) as
    | { token?: unknown; decision?: unknown; reason?: unknown }
    | undefined;

  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const decision = String(body?.decision ?? "").toUpperCase();

  if (!token) return fail("Token persetujuan wajib disertakan.", 422);
  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return fail("`decision` harus APPROVED atau REJECTED.", 422);
  }

  try {
    const updated = await decideByToken(token, {
      decision,
      reason: typeof body?.reason === "string" ? body.reason : undefined,
    });

    // Deliberately thin: the response to an emailed action says what happened
    // and nothing else. No payload, no approver list, no token echoed back.
    return ok({
      requestId: updated.id,
      status: updated.status,
      decision,
    });
  } catch (error) {
    return lifecycleFailure(error);
  }
}
