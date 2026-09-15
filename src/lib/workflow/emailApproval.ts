import { createToken } from "@/lib/auth/tokens";
import { getApprovalTtlHours, type SecurityTeam } from "@/lib/config/authEnv";
import { sendManagerApprovalEmail, sendSecurityProvisioningEmail } from "@/lib/email";
import type { AccessRequest, EmailHandoff, Employee, ApprovalReference } from "@/lib/types";

/**
 * Handing a workflow step to the person who has to act on it, by email.
 *
 * This is the only channel. Both steps that leave the system — the manager's
 * decision and the security team's provisioning — go out as an email with a
 * link to a decision page, and come back when somebody presses a button.
 * Neither needs a Jira project, a service account, or a licence for the person
 * being asked.
 *
 * Each step still carries a reference (`MAIL-…`, `SEC-…`) in a `ApprovalReference`
 * shape. That is deliberate: it is the handle the state machine tracks a step
 * by, so `applyIssueStatus` remained the single place that knows what a signal
 * *means* when the channel underneath it changed.
 */

/**
 * Who a hand-off ended up addressed to.
 *
 * Kept as a named shape rather than a bare string because the reason a
 * hand-off could NOT be addressed matters as much as the address: an email
 * nobody receives is a request that silently never moves, so the problem is
 * surfaced in the audit trail instead of being swallowed.
 */
export interface AssigneeResolution {
  accountId?: string;
  displayName?: string;
  /** Set when nobody could be addressed; shown to HC and in the audit trail. */
  problem?: string;
}

export interface HandoffResult {
  ref: ApprovalReference;
  assignee: AssigneeResolution;
  handoff: EmailHandoff;
}

/** A short, human-quotable id derived from the token. Uppercase: signals are matched that way. */
function referenceKey(prefix: string, token: string): string {
  return `${prefix}-${token.slice(0, 6).toUpperCase()}`;
}

function expiry(): Date {
  return new Date(Date.now() + getApprovalTtlHours() * 60 * 60 * 1000);
}

function handoffRecord(token: string, expiresAt: Date, sentTo: string): EmailHandoff {
  return {
    token,
    expiresAt: expiresAt.toISOString(),
    sentTo,
    sentAt: new Date().toISOString(),
  };
}

/** Step 2 — ask the employee's manager to approve. */
export async function createEmailApproval(
  employee: Employee,
  request: AccessRequest,
  baseUrl: string,
): Promise<HandoffResult> {
  if (!employee.managerEmail) {
    throw new Error(
      `${employee.displayName} tidak punya email manager, jadi permintaan persetujuan tidak bisa dikirim.`,
    );
  }

  const token = createToken();
  const expiresAt = expiry();
  const key = referenceKey("MAIL", token);

  const { delivered, error } = await sendManagerApprovalEmail(employee, request, token, expiresAt);

  // A failed send is fatal, and that is the point: the caller rolls the request
  // back rather than leaving an employee sitting in PENDING_MANAGER_APPROVAL
  // behind an email nobody ever received.
  if (!delivered) {
    throw new Error(
      `Email persetujuan ke ${employee.managerEmail} gagal dikirim${error ? ` (${error})` : ""}.`,
    );
  }

  return {
    ref: {
      key,
      url: `${baseUrl}/approvals/${encodeURIComponent(token)}`,
      status: "Menunggu keputusan",
      assignee: employee.managerEmail,
    },
    assignee: { displayName: employee.managerName },
    handoff: handoffRecord(token, expiresAt, employee.managerEmail),
  };
}

/** Step 3 — hand the provisioning job to the security team. */
export async function createSecurityEmailHandoff(
  employee: Employee,
  request: AccessRequest,
  baseUrl: string,
  team: SecurityTeam,
  approvedBy?: string,
): Promise<HandoffResult> {
  if (!team.email) {
    throw new Error(
      "SECURITY_TEAM_EMAIL belum diset, jadi permintaan penyiapan akses tidak bisa dikirim. Lihat .env.example.",
    );
  }

  const token = createToken();
  const expiresAt = expiry();
  const key = referenceKey("SEC", token);

  const { delivered, error } = await sendSecurityProvisioningEmail(
    employee,
    request,
    token,
    expiresAt,
    team,
    approvedBy,
  );

  if (!delivered) {
    throw new Error(
      `Email penyiapan akses ke ${team.email} gagal dikirim${error ? ` (${error})` : ""}.`,
    );
  }

  return {
    ref: {
      key,
      url: `${baseUrl}/approvals/${encodeURIComponent(token)}`,
      status: "Menunggu penyiapan",
      assignee: team.email,
    },
    assignee: { displayName: team.name },
    handoff: handoffRecord(token, expiresAt, team.email),
  };
}

/** Which step a token belongs to. Determines what the page offers. */
export type HandoffKind = "MANAGER" | "SECURITY";

export type HandoffLookup =
  | {
      status: "ok";
      kind: HandoffKind;
      request: AccessRequest;
      employee: Employee;
      handoff: EmailHandoff;
    }
  | { status: "not-found" }
  | { status: "expired" }
  | { status: "already-decided"; kind: HandoffKind; decidedAt: string; decidedBy?: string };

/**
 * Resolves an emailed token to the step it belongs to.
 *
 * "Already decided" is answered specifically rather than folded into
 * "not found": someone who clicks the link twice, or whose colleague was
 * forwarded it, should be told the decision is already recorded — not that
 * their link is broken.
 */
export function lookupApproval(
  requests: AccessRequest[],
  employees: Employee[],
  token: string,
): HandoffLookup {
  for (const request of requests) {
    const candidates: Array<[HandoffKind, EmailHandoff | undefined]> = [
      ["MANAGER", request.managerApproval],
      ["SECURITY", request.securityApproval],
    ];

    for (const [kind, handoff] of candidates) {
      if (handoff?.token !== token) continue;

      if (handoff.decidedAt) {
        return {
          status: "already-decided",
          kind,
          decidedAt: handoff.decidedAt,
          decidedBy: handoff.decidedBy,
        };
      }
      if (new Date(handoff.expiresAt).getTime() <= Date.now()) return { status: "expired" };

      const employee = employees.find((candidate) => candidate.id === request.employeeId);
      if (!employee) return { status: "not-found" };

      return { status: "ok", kind, request, employee, handoff };
    }
  }

  return { status: "not-found" };
}
