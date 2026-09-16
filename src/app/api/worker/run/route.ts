import { AdConfigurationError } from "@/lib/ad";
import { requirePermission } from "@/lib/auth/guard";
import { runDueJobs } from "@/lib/lifecycle/worker";
import { fail, ok } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

/**
 * POST /api/worker/run — executes everything that is due.
 *
 * Triggered deliberately rather than on a timer, because in the demo topology
 * there is nothing else to trigger it and an implicit background loop would
 * make changes to a directory at a moment nobody chose. The production shape is
 * a separate worker inside the corporate network claiming jobs over an
 * authenticated API; what this shares with it is the part that carries the
 * risk — ordering, checkpointing, verification — not the transport.
 *
 * The report says what was attempted and what came back, including failures.
 * A run that could not finish a job is a normal outcome reported as 200, not an
 * error: the request is FAILED, the reason is structured, and an operator picks
 * it up. Only being unable to run at all is a 5xx.
 */
export async function POST() {
  const guarded = await requirePermission("execution.run");
  if (!guarded.ok) return guarded.response;

  try {
    const report = await runDueJobs({ workerId: `portal-${guarded.session.username}` });
    return ok(report);
  } catch (error) {
    if (error instanceof AdConfigurationError) {
      // Misconfiguration, not a runtime fault: the deployment has not said
      // which directory it acts on, or has asked for a simulated one in
      // production. Both must be visible rather than worked around.
      return fail(error.message, 503, { code: "AD_NOT_CONFIGURED" });
    }
    console.error("[worker/run]", error);
    return fail("Worker gagal dijalankan.", 500);
  }
}
