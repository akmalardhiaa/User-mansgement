import { requirePermission } from "@/lib/auth/guard";
import { lifecycleFailure } from "@/lib/lifecycle/apiError";
import { reviseRequest } from "@/lib/lifecycle/service";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { parseLifecycleRequestInput } from "@/lib/validation/lifecycleRequestInput";

export const dynamic = "force-dynamic";

/**
 * POST /api/lifecycle-requests/[id]/revise — replaces the payload with a new version.
 *
 * A revision is not an edit. The request goes back to draft as a new version and
 * every approval already given is discarded, because those approvals were given
 * for text that no longer exists. HC then submits again and both approvers are
 * asked afresh — which is the only honest way to change something people have
 * already been asked to agree to.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guarded = await requirePermission("request.create");
  if (!guarded.ok) return guarded.response;

  const { id } = await context.params;

  const parsed = parseLifecycleRequestInput(await readJson(request));
  if (!parsed.ok) {
    return fail("Perbaiki isian yang ditandai.", 422, { fieldErrors: parsed.errors });
  }

  try {
    const revised = await reviseRequest(
      id,
      parsed.value.payload,
      guarded.session,
      parsed.value.effectiveAt,
    );
    return ok({ request: revised });
  } catch (error) {
    return lifecycleFailure(error);
  }
}
