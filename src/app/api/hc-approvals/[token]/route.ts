import { listEmployees, listRequests, transaction } from "@/lib/db/repository";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { clientKey, rateLimit } from "@/lib/http/rateLimit";
import { applyIssueStatus, type ResolvedSignal } from "@/lib/workflow/accessWorkflow";
import { lookupApproval, type HandoffKind } from "@/lib/workflow/emailApproval";

export const dynamic = "force-dynamic";

/** Decisions each kind of hand-off accepts. */
const ALLOWED: Record<HandoffKind, string[]> = {
  MANAGER: ["APPROVED", "REJECTED"],
  SECURITY: ["COMPLETED"],
};

/**
 * POST /api/approvals/[token] — the recipient's decision.
 *
 * Serves both steps that leave this system: the manager approving or rejecting,
 * and the security team marking provisioning done. Which one a token belongs to
 * is determined by the token itself, never by the caller — so a manager link
 * cannot be used to close a provisioning job, or the reverse.
 *
 * Public by necessity: neither a manager nor the security team has an account
 * here, and provisioning a login for every approver in the company is exactly
 * what this channel avoids. The emailed token is the credential, which is why
 * it is 32 random bytes, expires, and is spent on first use.
 *
 * POST rather than GET on purpose. Mail scanners, link previewers and
 * prefetchers follow every URL in a message; if deciding were a GET, the
 * decision would be made by a security appliance before a human read it.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/hc-approvals/[token]">) {
  const { token } = await ctx.params;

  const limit = rateLimit(clientKey(request, "approval"), 20, 15 * 60 * 1000);
  if (!limit.allowed) {
    return fail("Terlalu banyak percobaan. Coba lagi nanti.", 429, { retryAfter: limit.retryAfter });
  }

  const body = (await readJson(request)) as { decision?: unknown } | undefined;
  const decision = typeof body?.decision === "string" ? body.decision.toUpperCase() : "";

  const [requests, employees] = await Promise.all([listRequests(), listEmployees()]);
  const found = lookupApproval(requests, employees, token);

  if (found.status === "not-found") {
    return fail("Tautan tidak valid.", 404, { code: "APPROVAL_INVALID" });
  }
  if (found.status === "expired") {
    return fail("Tautan sudah kedaluwarsa. Hubungi Human Capital.", 410, {
      code: "APPROVAL_EXPIRED",
    });
  }
  if (found.status === "already-decided") {
    return fail("Permintaan ini sudah diproses sebelumnya.", 409, {
      code: "APPROVAL_DECIDED",
      decidedAt: found.decidedAt,
      decidedBy: found.decidedBy,
    });
  }

  const { kind, request: accessRequest, employee } = found;

  if (!ALLOWED[kind].includes(decision)) {
    return fail(`Keputusan harus salah satu dari: ${ALLOWED[kind].join(", ")}.`, 422);
  }

  // The reference belonging to *this* step, so a token can only ever move the
  // step it was issued for.
  const issueKey =
    kind === "MANAGER" ? accessRequest.managerIssue?.key : accessRequest.securityIssue?.key;
  if (!issueKey) {
    return fail("Permintaan ini tidak punya referensi yang bisa diproses.", 409);
  }

  // The decision is already known — a human pressed a button — so it is passed
  // through as a resolved signal instead of being encoded as a status name for
  // the state machine to interpret. The status name is now purely what a
  // person reads in the audit trail.
  const resolved: ResolvedSignal =
    kind === "SECURITY" ? "SECURITY_DONE" : decision === "APPROVED" ? "APPROVED" : "REJECTED";

  const statusName =
    kind === "SECURITY"
      ? "Penyiapan selesai"
      : decision === "APPROVED"
        ? "Disetujui manager"
        : "Ditolak manager";

  const actor =
    kind === "SECURITY"
      ? `${accessRequest.securityApproval?.sentTo ?? "IT Security"} (IT Security)`
      : `${employee.managerName} (manager)`;

  try {
    const result = await applyIssueStatus({
      issueKey,
      statusName,
      resolved,
      actor,
      source: "email",
    });

    // Spend the token only once the transition actually landed. Stamping it
    // first would burn the link on a failure the recipient could just retry.
    const landed =
      result.outcome === "rejected" ||
      result.outcome === "security_ticket_created" ||
      result.outcome === "completed";

    if (landed) {
      await transaction((draft) => {
        const stored = draft.requests.find((candidate) => candidate.id === accessRequest.id);
        const handoff = kind === "MANAGER" ? stored?.managerApproval : stored?.securityApproval;
        if (handoff) {
          handoff.decidedAt = new Date().toISOString();
          handoff.decidedBy = actor;
        }
        const ref = kind === "MANAGER" ? stored?.managerIssue : stored?.securityIssue;
        if (ref) ref.status = statusName;
        return undefined;
      });
    }

    return ok({
      kind,
      decision,
      outcome: result.outcome,
      message: result.message,
      employeeName: employee.displayName,
    });
  } catch (error) {
    console.error("[approvals:decide]", error);
    return fail("Gagal mencatat keputusan. Coba lagi.", 500);
  }
}
