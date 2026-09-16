import { requirePermission } from "@/lib/auth/guard";
import { listActivity } from "@/lib/db/repository";
import { ok } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

/** GET /api/activity — the whole activity log, newest first. */
export async function GET() {
  const guarded = await requirePermission("activity.read");
  if (!guarded.ok) return guarded.response;

  return ok({ activity: await listActivity() });
}
