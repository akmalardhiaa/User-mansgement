import { requirePermission } from "@/lib/auth/guard";
import { lifecycleFailure } from "@/lib/lifecycle/apiError";
import { cancelRequest } from "@/lib/lifecycle/service";
import { ok, readJson } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

/**
 * POST /api/lifecycle-requests/[id]/cancel — withdraws a request.
 *
 * Only works while no worker has claimed the job; the state machine stops
 * allowing it at EXECUTING. Cancelling something that is already being applied
 * to the directory is an operations matter, and reporting it as cancelled here
 * would be a lie about what the directory now contains.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guarded = await requirePermission("request.cancel");
  if (!guarded.ok) return guarded.response;

  const { id } = await context.params;
  const body = (await readJson(request)) as { reason?: unknown } | undefined;

  try {
    const cancelled = await cancelRequest(
      id,
      guarded.session,
      typeof body?.reason === "string" ? body.reason : undefined,
    );
    return ok({ request: cancelled });
  } catch (error) {
    return lifecycleFailure(error);
  }
}
