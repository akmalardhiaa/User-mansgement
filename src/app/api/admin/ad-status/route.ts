import { runAdDiagnostics } from "@/lib/ad/diagnostics";
import { requirePermission } from "@/lib/auth/guard";
import { ok } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

export async function GET() {
  const guarded = await requirePermission("execution.run");
  if (!guarded.ok) return guarded.response;

  return ok(await runAdDiagnostics());
}
