import { requirePermission } from "@/lib/auth/guard";
import { lifecycleFailure } from "@/lib/lifecycle/apiError";
import { createDraft, listRequests } from "@/lib/lifecycle/service";
import { LIFECYCLE_STATUSES, type LifecycleStatus, type LifecycleType } from "@/lib/lifecycle/types";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { parseLifecycleRequestInput } from "@/lib/validation/lifecycleRequestInput";

export const dynamic = "force-dynamic";

/**
 * GET /api/lifecycle-requests — the requests this caller may see.
 *
 * Scope is applied in the service, not here: an approver gets the requests
 * routed to them rather than the whole queue.
 */
export async function GET(request: Request) {
  const guarded = await requirePermission("request.read");
  if (!guarded.ok) return guarded.response;

  const url = new URL(request.url);

  const rawType = url.searchParams.get("type")?.toUpperCase();
  const type =
    rawType === "ONBOARDING" || rawType === "MOVEMENT" || rawType === "TERMINATION"
      ? (rawType as LifecycleType)
      : undefined;

  // Unknown status names are dropped rather than rejected: a stale bookmark
  // should narrow the list, not produce an error page.
  const status = (url.searchParams.get("status") ?? "")
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry): entry is LifecycleStatus =>
      (LIFECYCLE_STATUSES as readonly string[]).includes(entry),
    );

  const limit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const offset = Number.parseInt(url.searchParams.get("offset") ?? "", 10);

  const result = await listRequests(guarded.session, {
    type,
    status,
    limit: Number.isFinite(limit) ? limit : undefined,
    offset: Number.isFinite(offset) ? offset : undefined,
  });

  return ok(result);
}

/**
 * POST /api/lifecycle-requests — opens a draft.
 *
 * Creating is separate from submitting on purpose: nothing is routed and nobody
 * is asked until POST /:id/submit, which is also where the payload is frozen.
 */
export async function POST(request: Request) {
  const guarded = await requirePermission("request.create");
  if (!guarded.ok) return guarded.response;

  const parsed = parseLifecycleRequestInput(await readJson(request));
  if (!parsed.ok) {
    return fail("Perbaiki isian yang ditandai.", 422, { fieldErrors: parsed.errors });
  }

  try {
    const created = await createDraft(parsed.value, guarded.session);
    return ok({ request: created }, 201);
  } catch (error) {
    return lifecycleFailure(error);
  }
}
