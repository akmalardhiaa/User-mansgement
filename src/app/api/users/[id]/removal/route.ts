import { RequestNotAllowedError } from "@/lib/db/repository";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { JiraApiError } from "@/lib/jira/jiraClient";
import { submitOffboardingRequest } from "@/lib/workflow/accessWorkflow";

export const dynamic = "force-dynamic";

/**
 * POST /api/users/:id/removal — Step 1 of the offboarding chain.
 *
 * Like creating a user, this does not touch the account itself. It parks the
 * employee in `PENDING_REMOVAL_APPROVAL` and raises the manager's approval
 * ticket; IT Security only deprovisions once the manager approves in Jira.
 *
 * Body: `{ "reason"?: string }`
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await readJson(request)) as { reason?: unknown } | undefined;
  const reason = typeof body?.reason === "string" ? body.reason : undefined;

  try {
    const { employee, request: removal } = await submitOffboardingRequest(id, reason);
    return ok({ employee, request: removal, managerIssue: removal.managerIssue }, 201);
  } catch (error) {
    if (error instanceof RequestNotAllowedError) {
      return fail(error.message, 409);
    }
    if (error instanceof JiraApiError) {
      return fail(
        `Pengajuan penghapusan gagal dikirim ke Jira, jadi tidak ada yang berubah. ${error.message}`,
        502,
      );
    }
    console.error("[api/users/:id/removal] failed:", error);
    return fail("Pengajuan penghapusan gagal dibuat.", 500);
  }
}
