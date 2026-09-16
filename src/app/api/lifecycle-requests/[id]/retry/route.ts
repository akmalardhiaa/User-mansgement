import { requirePermission } from "@/lib/auth/guard";
import { lifecycleFailure } from "@/lib/lifecycle/apiError";
import { retryRequest } from "@/lib/lifecycle/service";
import { ok, readJson } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

/**
 * POST /api/lifecycle-requests/[id]/retry — queues a failed execution again.
 *
 * The backend recomputes whether a retry is allowed rather than accepting the
 * caller's word for it. Some failures must never be retried — a directory that
 * drifted since approval, a payload that no longer matches its fingerprint —
 * because repeating the job would apply a change nobody agreed to in its
 * current form.
 *
 * An operator's job, not the requester's: this is `execution.run`, the same
 * capability as running the worker at all.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guarded = await requirePermission("execution.run");
  if (!guarded.ok) return guarded.response;

  const { id } = await context.params;
  const body = (await readJson(request)) as { acknowledgedReconciliation?: unknown } | undefined;

  try {
    const updated = await retryRequest(id, guarded.session, {
      acknowledgedReconciliation: body?.acknowledgedReconciliation === true,
    });
    return ok({ request: updated });
  } catch (error) {
    return lifecycleFailure(error);
  }
}
