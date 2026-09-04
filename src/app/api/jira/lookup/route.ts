import { fail, ok } from "@/lib/http/apiResponse";
import { getJiraClient } from "@/lib/jira/jiraClient";

export const dynamic = "force-dynamic";

/**
 * GET /api/jira/lookup?email=… — does Jira know this person?
 *
 * The same lookup `resolveAssignee` runs when a ticket is created, moved to
 * where HC can act on the answer. Failing it there is silent by design: an
 * unassigned ticket that exists beats no ticket at all, so a bad address is
 * recorded as a `notify.failed` line in the audit trail and the request sits
 * waiting on a manager who was never told. Asking the same question while the
 * form is still open turns that into a typo someone can fix.
 *
 * Advisory, never a gate. A Jira outage must not stop HC filing a request —
 * "unknown" comes back as its own state so the form can say it could not check
 * rather than that the address is wrong.
 */
export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email")?.trim();
  if (!email) return fail("Parameter email wajib diisi.", 400);

  try {
    const user = await getJiraClient().findUserByEmail(email);
    return ok(
      user
        ? { status: "found" as const, displayName: user.displayName, accountId: user.accountId }
        : { status: "missing" as const },
    );
  } catch (error) {
    return ok({ status: "unknown" as const, reason: (error as Error).message });
  }
}
