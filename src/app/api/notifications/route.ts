import { listEmployees, listRequests } from "@/lib/db/repository";
import { ok } from "@/lib/http/apiResponse";
import { buildFeed } from "@/lib/notifications/feed";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications — what is waiting, and what has moved.
 *
 * Derived here rather than in the client so the bell costs one request instead
 * of pulling the whole roster and every audit trail across the wire on a timer.
 * The session gate is the middleware's; every /api route is behind it.
 */
export async function GET() {
  const [requests, employees] = await Promise.all([listRequests(), listEmployees()]);
  return ok(buildFeed(requests, employees));
}
