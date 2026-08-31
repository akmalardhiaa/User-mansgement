import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { setEmployeeAccess } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/users/:id/access — HC enabling or disabling an existing account.
 * Body: `{ "enabled": boolean }`
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await readJson(request)) as { enabled?: unknown } | undefined;

  if (typeof body?.enabled !== "boolean") {
    return fail("Body harus memuat field `enabled` bertipe boolean.", 422);
  }

  try {
    return ok({ employee: await setEmployeeAccess(id, body.enabled) });
  } catch (error) {
    return fail((error as Error).message, 409);
  }
}
