import { requirePermission } from "@/lib/auth/guard";
import { listEmployees } from "@/lib/db/repository";
import { ok } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

/**
 * GET /api/users — the roster rendered by the directory.
 *
 * Read-only now. `POST` used to create an employee outright, and it is gone:
 * adding somebody is an Onboarding request that carries a manager's and the
 * CISO's approval and is applied by the execution worker, which then writes the
 * record from what the directory actually confirmed.
 */
export async function GET() {
  const guarded = await requirePermission("directory.read");
  if (!guarded.ok) return guarded.response;

  return ok({ employees: await listEmployees() });
}
