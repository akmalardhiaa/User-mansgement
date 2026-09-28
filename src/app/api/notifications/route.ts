import { getSession } from "@/lib/auth/current";
import { notificationsFor } from "@/lib/lifecycle/notifications";
import { listRequests } from "@/lib/lifecycle/service";

/**
 * The header bell's feed: what HC needs to notice right now.
 *
 * The rules — which statuses count and how long an approval may sit before
 * somebody should chase it — live in lib/lifecycle/notifications.ts. This is
 * only the session check and the read.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ items: [], total: 0, needsAttention: 0 }, { status: 401 });
  }

  /*
   * One read rather than four. The store is a single JSON file, `listRequests`
   * already applies this session's visibility, and its cap of 100 is far above
   * anything a demo roster produces.
   */
  const { requests } = await listRequests(session, {
    status: ["PENDING_MANAGER", "PENDING_CISO", "FAILED", "REJECTED", "COMPLETED"],
    limit: 100,
  });

  return Response.json(notificationsFor(requests));
}
