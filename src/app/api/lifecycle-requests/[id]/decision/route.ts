import { requireSession } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/roles";
import { lifecycleFailure } from "@/lib/lifecycle/apiError";
import { decide } from "@/lib/lifecycle/service";
import { fail, ok, readJson } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

/**
 * POST /api/lifecycle-requests/[id]/decision — records one approval decision.
 *
 * Two independent checks stand between a caller and a decision, and both are
 * needed. This route checks the caller holds the permission for the stage they
 * are answering, so a manager cannot reach the CISO stage at all. The service
 * then checks the caller IS the person that stage was addressed to, so holding
 * the MANAGER role is not enough to decide somebody else's request.
 *
 * Until approvals arrive by email this is the portal path; the plan treats the
 * browser route as the agreed fallback, and the same service call will back the
 * Outlook action.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guarded = await requireSession();
  if (!guarded.ok) return guarded.response;

  const { id } = await context.params;
  const body = (await readJson(request)) as
    | { version?: unknown; stage?: unknown; decision?: unknown; reason?: unknown }
    | undefined;

  const stage = String(body?.stage ?? "").toUpperCase();
  const decision = String(body?.decision ?? "").toUpperCase();

  if (stage !== "MANAGER" && stage !== "CISO") {
    return fail("`stage` harus MANAGER atau CISO.", 422);
  }
  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return fail("`decision` harus APPROVED atau REJECTED.", 422);
  }
  if (typeof body?.version !== "number" || !Number.isInteger(body.version)) {
    return fail("Body harus memuat `version` bertipe bilangan bulat.", 422);
  }

  const needed = stage === "MANAGER" ? "approval.manager" : "approval.ciso";
  if (!hasPermission(guarded.session.roles, needed)) {
    return fail("Akses ditolak. Peran Anda tidak mencakup tahap persetujuan ini.", 403, {
      code: "FORBIDDEN",
      requiredPermission: needed,
    });
  }

  try {
    const updated = await decide(
      id,
      {
        version: body.version,
        stage,
        decision,
        reason: typeof body.reason === "string" ? body.reason : undefined,
      },
      guarded.session,
    );
    return ok({ request: updated });
  } catch (error) {
    return lifecycleFailure(error);
  }
}
