import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { isAuthorisedWebhook, parseJiraWebhook } from "@/lib/jira/webhookPayload";
import { applyIssueStatus } from "@/lib/workflow/onboardingWorkflow";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/jira — Step 2 and Step 4 of the approval workflow.
 *
 * Register this URL in Jira under *System → WebHooks* for the `issue updated`
 * event, scoped with a JQL filter such as `project = HC`, and append the shared
 * secret (`?secret=…` or the `x-hc-webhook-secret` header).
 *
 * Depending on which ticket moved, this either raises the IT Security
 * provisioning ticket or flips the employee to Active.
 */
export async function POST(request: Request) {
  if (!isAuthorisedWebhook(request)) {
    return fail("Invalid webhook secret.", 401);
  }

  const parsed = parseJiraWebhook(await readJson(request));
  if (!parsed) {
    return fail("Payload did not contain an issue key and a status.", 400);
  }

  try {
    const result = await applyIssueStatus({
      issueKey: parsed.issueKey,
      statusName: parsed.statusName,
      actor: parsed.actor,
      source: "webhook",
    });

    // Always 200 for recognised-but-irrelevant events: a non-2xx makes Jira
    // retry, and there is nothing to retry when the transition simply is not
    // one this workflow cares about.
    return ok(result);
  } catch (error) {
    console.error("[api/webhooks/jira] transition failed:", error);
    // A 500 here is intentional — Jira should redeliver so the follow-up ticket
    // eventually gets raised.
    return fail(`Could not apply the transition: ${(error as Error).message}`, 500);
  }
}
