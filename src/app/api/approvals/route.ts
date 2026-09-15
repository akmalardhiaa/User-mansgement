import type { ApprovalStatus } from "@prisma/client";

import { approvalFailure } from "@/lib/approval/http";
import { listApprovals } from "@/lib/approval/service";
import { requireAdmin } from "@/lib/auth/guard";
import { ok } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

const STATUSES: ApprovalStatus[] = [
  "PENDING",
  "MANAGER_APPROVED",
  "MANAGER_REJECTED",
  "IT_APPROVED",
  "IT_REJECTED",
  "ACTIVE",
];

function bounded(value: string | null, fallback: number, max: number): number {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? Math.min(parsed, max) : fallback;
}

/** GET /api/approvals?status=&q=&take=&skip= — every approval request. Admin only. */
export async function GET(request: Request) {
  const guarded = await requireAdmin(request);
  if (!guarded.ok) return guarded.response;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  try {
    return ok(
      await listApprovals({
        status: STATUSES.includes(status as ApprovalStatus) ? (status as ApprovalStatus) : undefined,
        q: url.searchParams.get("q") ?? undefined,
        take: bounded(url.searchParams.get("take"), 50, 200),
        skip: bounded(url.searchParams.get("skip"), 0, 100_000),
      }),
    );
  } catch (error) {
    return approvalFailure(error, "approvals:list");
  }
}
