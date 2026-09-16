import { requirePermission } from "@/lib/auth/guard";
import { lifecycleFailure } from "@/lib/lifecycle/apiError";
import { submitRequest } from "@/lib/lifecycle/service";
import { fail, ok, readJson } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

/**
 * POST /api/lifecycle-requests/[id]/submit — freezes the payload and routes it.
 *
 * The body carries the version the caller believes they are submitting. That is
 * what makes a stale tab harmless: if the request has been revised since the
 * screen loaded, the version will not match and the submit is refused rather
 * than sending text the person never saw.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guarded = await requirePermission("request.create");
  if (!guarded.ok) return guarded.response;

  const { id } = await context.params;
  const body = (await readJson(request)) as { version?: unknown } | undefined;

  if (typeof body?.version !== "number" || !Number.isInteger(body.version)) {
    return fail("Body harus memuat `version` bertipe bilangan bulat.", 422);
  }

  try {
    const submitted = await submitRequest(id, body.version, guarded.session);
    return ok({ request: submitted });
  } catch (error) {
    return lifecycleFailure(error);
  }
}
