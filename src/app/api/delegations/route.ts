import { requirePermission } from "@/lib/auth/guard";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { lifecycleFailure } from "@/lib/lifecycle/apiError";
import { createDelegation, listDelegations } from "@/lib/lifecycle/delegationService";
import { parseDelegationInput } from "@/lib/validation/delegationInput";

export const dynamic = "force-dynamic";

/** GET /api/delegations — every delegation, ended ones included. */
export async function GET() {
  const guarded = await requirePermission("delegation.manage");
  if (!guarded.ok) return guarded.response;

  return ok({ delegations: await listDelegations() });
}

/**
 * POST /api/delegations — hands an absent manager's approvals to a substitute.
 *
 * `reroutePending` also moves requests already waiting on that manager. It is
 * never implied: moving a request someone was already emailed about is a
 * decision HC makes on purpose, and the response says which ones moved and
 * which were left because moving them would break separation of duties.
 */
export async function POST(request: Request) {
  const guarded = await requirePermission("delegation.manage");
  if (!guarded.ok) return guarded.response;

  const parsed = parseDelegationInput(await readJson(request));
  if (!parsed.ok) {
    return fail("Perbaiki isian yang ditandai.", 422, { fieldErrors: parsed.errors });
  }

  try {
    const created = await createDelegation(parsed.value, guarded.session);
    return ok(created, 201);
  } catch (error) {
    return lifecycleFailure(error);
  }
}
