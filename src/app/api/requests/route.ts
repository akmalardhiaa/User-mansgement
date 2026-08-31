import { listRequests } from "@/lib/db/repository";
import { ok } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

/** GET /api/requests — every onboarding request with its Jira tickets and audit trail. */
export async function GET() {
  return ok({ requests: await listRequests() });
}
