import { requirePermission } from "@/lib/auth/guard";
import { EmailConfigurationError } from "@/lib/email";
import { dispatchDueEmails } from "@/lib/lifecycle/dispatcher";
import { fail, ok } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

/**
 * POST /api/outbox/dispatch — sends the approval emails that are due.
 *
 * Triggered deliberately, like the execution worker, and guarded by the same
 * permission: both are "run the background work", and inventing a second
 * capability for a demo would add a role to administer without adding a
 * decision anybody makes differently.
 *
 * A message that could not be sent is a normal outcome reported as 200 — the
 * event is retried or dead-lettered and the report says which. Only being
 * unable to run at all is a 5xx.
 */
export async function POST() {
  const guarded = await requirePermission("execution.run");
  if (!guarded.ok) return guarded.response;

  try {
    return ok(await dispatchDueEmails());
  } catch (error) {
    if (error instanceof EmailConfigurationError) {
      // The deployment has not said how approval emails leave the building, or
      // has asked for the simulated driver in production. Both must be visible.
      return fail(error.message, 503, { code: "EMAIL_NOT_CONFIGURED" });
    }
    console.error("[outbox/dispatch]", error);
    return fail("Dispatcher gagal dijalankan.", 500);
  }
}
