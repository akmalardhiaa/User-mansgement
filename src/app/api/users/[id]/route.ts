import { actorNameOf } from "@/lib/auth/current";
import { requirePermission } from "@/lib/auth/guard";
import { getEmployeeById, updateEmployeeProfile } from "@/lib/db/repository";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { parseEmployeeProfileInput } from "@/lib/validation/employeeProfileInput";

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

/**
 * PUT /api/users/[id] — edit an employee's profile.
 *
 * This is the unmediated half of the model: correcting a name, filling in a job
 * description, recording that someone moved from contract to permanent. None
 * of it changes who has access, which is why it needs no approval.
 *
 * Anything that *does* change access goes elsewhere on purpose, so this route
 * cannot be used to route a change around the manager.
 */
export async function PUT(request: Request, ctx: RouteContext<"/api/users/[id]">) {
  const guarded = await requirePermission("employee.update");
  if (!guarded.ok) return guarded.response;

  const { id } = await ctx.params;

  const parsed = parseEmployeeProfileInput(await readJson(request));
  if (!parsed.ok) {
    return fail("Perbaiki isian yang ditandai.", 422, { fieldErrors: parsed.errors });
  }

  try {
    const employee = await updateEmployeeProfile(id, parsed.value, actorNameOf(guarded.session));
    return ok({ employee, message: "Profil karyawan diperbarui." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal memperbarui profil.";

    // The repository throws for both "no such employee" and "busy in an
    // approval". They are different answers: one is a 404, the other a 409
    // the caller can resolve by finishing that request first.
    if (message.includes("tidak ditemukan")) return fail(message, 404);
    if (message.includes("sedang dalam proses")) return fail(message, 409);

    console.error("[users:update]", error);
    return fail("Gagal memperbarui profil karyawan.", 500);
  }
}
