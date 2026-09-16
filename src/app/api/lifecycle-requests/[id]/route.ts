import { requirePermission } from "@/lib/auth/guard";
import { lifecycleFailure } from "@/lib/lifecycle/apiError";
import { auditTrailFor, getRequest } from "@/lib/lifecycle/service";
import { ok } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

/**
 * GET /api/lifecycle-requests/[id] — one request with its audit trail.
 *
 * The trail comes from recorded events, not from anything reconstructed for
 * display: the detail screen shows what actually happened, in the order it
 * happened, or it shows nothing.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guarded = await requirePermission("request.read");
  if (!guarded.ok) return guarded.response;

  const { id } = await context.params;

  try {
    const found = await getRequest(id, guarded.session);
    return ok({ request: found, audit: await auditTrailFor(found.id) });
  } catch (error) {
    return lifecycleFailure(error);
  }
}
