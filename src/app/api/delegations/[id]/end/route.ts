import { requirePermission } from "@/lib/auth/guard";
import { ok } from "@/lib/http/apiResponse";
import { lifecycleFailure } from "@/lib/lifecycle/apiError";
import { endDelegation } from "@/lib/lifecycle/delegationService";

export const dynamic = "force-dynamic";

/**
 * POST /api/delegations/[id]/end — ends a delegation before its last day.
 *
 * New requests go back to the manager immediately. Requests already sent to the
 * substitute stay with them.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guarded = await requirePermission("delegation.manage");
  if (!guarded.ok) return guarded.response;

  const { id } = await context.params;
  try {
    return ok({ delegation: await endDelegation(id, guarded.session) });
  } catch (error) {
    return lifecycleFailure(error);
  }
}
