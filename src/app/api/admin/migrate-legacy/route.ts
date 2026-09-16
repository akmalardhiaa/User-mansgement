import { actorNameOf } from "@/lib/auth/current";
import { requirePermission } from "@/lib/auth/guard";
import { migrateLegacyWorkflow } from "@/lib/db/migrateLegacy";
import { fail, ok } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/migrate-legacy — retires the old Jira-era workflow.
 *
 * A one-off, run deliberately by an administrator rather than triggered on
 * boot. An implicit migration that fires the first time the store is read would
 * rewrite people's account statuses at a moment nobody chose, and report it to
 * nobody. This one returns exactly what it changed.
 *
 * Safe to call twice: the second call reports that there was nothing to do.
 */
export async function POST() {
  const guarded = await requirePermission("system.migrate");
  if (!guarded.ok) return guarded.response;

  try {
    const report = await migrateLegacyWorkflow(
      actorNameOf(guarded.session),
      guarded.session.userId,
    );
    return ok(report);
  } catch (error) {
    console.error("[admin/migrate-legacy]", error);
    return fail("Migrasi gagal dijalankan.", 500);
  }
}
