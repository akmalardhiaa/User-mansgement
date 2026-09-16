import { requireSession } from "@/lib/auth/guard";
import { permissionsOf } from "@/lib/auth/roles";
import { ok } from "@/lib/http/apiResponse";
import { preflight, withCors } from "@/lib/http/cors";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/**
 * GET /api/auth/me — the signed-in account.
 *
 * Resolved from the stored session, so it reflects a revocation immediately.
 * The effective permission list is included because the UI needs to know what
 * to render; it is a convenience for the client and never the basis of a
 * decision, which is always taken server-side from the roles.
 */
export async function GET(request: Request) {
  const guarded = await requireSession();
  if (!guarded.ok) return withCors(guarded.response, request);

  const { userId, username, email, fullName, roles, department } = guarded.session;
  return withCors(
    ok({
      user: { id: userId, username, email, fullName, roles, department },
      permissions: permissionsOf(roles),
    }),
    request,
  );
}
