import { RequestNotAllowedError } from "@/lib/db/repository";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { JiraApiError } from "@/lib/jira/jiraClient";
import { parseTransferInput } from "@/lib/validation/transferInput";
import { submitTransferRequest } from "@/lib/workflow/accessWorkflow";

export const dynamic = "force-dynamic";

/**
 * POST /api/users/:id/transfer — Step 1 of the transfer chain.
 *
 * Like creating a user, this changes nothing yet. It parks the employee in
 * `PENDING_TRANSFER_APPROVAL` and raises the manager's approval ticket; the new
 * department and position are only applied once IT Security closes the second
 * ticket, so the directory never shows a move that has not happened.
 *
 * Body: `{ "department": string, "jobTitle": string,
 *          "managerName"?: string, "managerEmail"?: string, "reason"?: string }`
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = parseTransferInput(await readJson(request));

  if (!parsed.ok) {
    return fail("Perbaiki isian yang ditandai.", 422, { fieldErrors: parsed.errors });
  }

  try {
    const { employee, request: transfer } = await submitTransferRequest(id, parsed.value);
    return ok({ employee, request: transfer, managerIssue: transfer.managerIssue }, 201);
  } catch (error) {
    if (error instanceof RequestNotAllowedError) {
      return fail(error.message, 409);
    }
    if (error instanceof JiraApiError) {
      return fail(
        `Pengajuan pindah divisi gagal dikirim ke Jira, jadi tidak ada yang berubah. ${error.message}`,
        502,
      );
    }
    console.error("[api/users/:id/transfer] failed:", error);
    return fail("Pengajuan pindah divisi gagal dibuat.", 500);
  }
}
