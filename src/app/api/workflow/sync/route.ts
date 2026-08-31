import { fail, ok } from "@/lib/http/apiResponse";
import { syncOpenRequests } from "@/lib/workflow/accessWorkflow";

export const dynamic = "force-dynamic";

/**
 * POST /api/workflow/sync — the polling alternative to the webhook.
 *
 * Reads the current Jira status of every open request and applies the same
 * transitions the webhook would. Safe to call repeatedly (transitions are
 * de-duplicated), so it also works as a cron target.
 */
export async function POST() {
  try {
    return ok(await syncOpenRequests());
  } catch (error) {
    console.error("[api/workflow/sync] failed:", error);
    return fail(`Sync failed: ${(error as Error).message}`, 502);
  }
}
