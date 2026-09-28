import { requirePermission } from "@/lib/auth/guard";
import { lifecycleFailure } from "@/lib/lifecycle/apiError";
import { reviseAndResubmit } from "@/lib/lifecycle/service";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { parseLifecycleRequestInput } from "@/lib/validation/lifecycleRequestInput";

export const dynamic = "force-dynamic";

/**
 * POST /api/lifecycle-requests/[id]/revise — replaces the payload and sends it
 * straight back to the approvers.
 *
 * A revision is not an edit. The request becomes a new version and every
 * approval already given is discarded, because those approvals were given for
 * text that no longer exists. Both approvers are then asked afresh — starting
 * with the manager, who is emailed about the new version in the same
 * transaction. If that resubmit cannot happen (a separation-of-duties clash, an
 * approver that cannot be resolved), nothing changes at all.
 *
 * The body carries `version`: the one the requester was looking at. It is
 * required, not optional, because a stale tab silently replacing somebody
 * else's revision is exactly the failure it exists to stop.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guarded = await requirePermission("request.create");
  if (!guarded.ok) return guarded.response;

  const { id } = await context.params;
  const body = await readJson(request);

  const version = (body as { version?: unknown } | undefined)?.version;
  if (typeof version !== "number" || !Number.isInteger(version)) {
    return fail("Body harus memuat `version` bertipe bilangan bulat.", 422);
  }

  const parsed = parseLifecycleRequestInput(body);
  if (!parsed.ok) {
    return fail("Perbaiki isian yang ditandai.", 422, { fieldErrors: parsed.errors });
  }

  try {
    const revised = await reviseAndResubmit(
      id,
      version,
      parsed.value.payload,
      guarded.session,
      parsed.value.effectiveAt,
    );
    return ok({ request: revised });
  } catch (error) {
    return lifecycleFailure(error);
  }
}
