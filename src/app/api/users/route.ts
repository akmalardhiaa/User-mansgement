import { DuplicateEmailError, listEmployees } from "@/lib/db/repository";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { JiraApiError } from "@/lib/jira/jiraClient";
import { parseNewUserInput } from "@/lib/validation/userInput";
import { submitOnboardingRequest } from "@/lib/workflow/accessWorkflow";

export const dynamic = "force-dynamic";

/** GET /api/users — the roster rendered by the HC dashboard. */
export async function GET() {
  return ok({ employees: await listEmployees() });
}

/**
 * POST /api/users — Step 1 of the approval workflow.
 *
 * This deliberately does NOT activate an account. It records the joiner as
 * PENDING_MANAGER_APPROVAL and raises the manager's approval ticket in Jira.
 */
export async function POST(request: Request) {
  const parsed = parseNewUserInput(await readJson(request));
  if (!parsed.ok) {
    return fail("Please correct the highlighted fields.", 422, { fieldErrors: parsed.errors });
  }

  try {
    const { employee, request: onboarding } = await submitOnboardingRequest(parsed.value);
    return ok(
      {
        employee,
        request: onboarding,
        managerIssue: onboarding.managerIssue,
      },
      201,
    );
  } catch (error) {
    if (error instanceof DuplicateEmailError) {
      return fail(error.message, 409, { fieldErrors: { email: error.message } });
    }
    if (error instanceof JiraApiError) {
      return fail(
        `The request could not be sent to Jira, so nothing was saved. ${error.message}`,
        502,
      );
    }
    console.error("[api/users] submit failed:", error);
    return fail("Could not submit the onboarding request.", 500);
  }
}
