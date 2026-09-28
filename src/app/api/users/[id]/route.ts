import { requirePermission } from "@/lib/auth/guard";
import { getEmployeeById } from "@/lib/db/repository";
import { fail, ok } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

/** GET /api/users/[id] — one employee record. */
export async function GET(_request: Request, ctx: RouteContext<"/api/users/[id]">) {
  const guarded = await requirePermission("directory.read");
  if (!guarded.ok) return guarded.response;

  const { id } = await ctx.params;

  const employee = await getEmployeeById(id);
  if (!employee) return fail("Karyawan tidak ditemukan.", 404);

  return ok({ employee });
}

/*
 * There is deliberately no PUT here any more.
 *
 * It used to write a profile straight to the record, department and job title
 * included, with no approval — so a division change could skip the manager and
 * the CISO entirely, and the directory would claim a change Active Directory had
 * never been told about. Editing a profile is now a PROFILE_UPDATE request
 * (POST /api/lifecycle-requests), approved twice and applied by the worker.
 * Leaving the old route beside it would leave the bypass beside the control.
 */
