import { AdConfigurationError } from "@/lib/ad";
import { seedMockAdFromDirectory } from "@/lib/ad/seedFromDirectory";
import { AdError } from "@/lib/ad/types";
import { requirePermission } from "@/lib/auth/guard";
import { fail, ok } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/seed-mock-ad — populates the simulated directory from the roster.
 *
 * A demo fixture, not a feature. It exists because the demo starts with
 * employees and an empty directory, which no real deployment is ever in, and
 * every Movement and Termination would otherwise fail on a missing object.
 *
 * Safe to call repeatedly: employees already linked are left alone.
 */
export async function POST() {
  const guarded = await requirePermission("system.migrate");
  if (!guarded.ok) return guarded.response;

  try {
    return ok(await seedMockAdFromDirectory());
  } catch (error) {
    if (error instanceof AdConfigurationError) {
      return fail(error.message, 503, { code: "AD_NOT_CONFIGURED" });
    }
    if (error instanceof AdError) {
      return fail(error.message, 409, { code: error.kind });
    }
    console.error("[admin/seed-mock-ad]", error);
    return fail("Seeding direktori simulasi gagal.", 500);
  }
}
