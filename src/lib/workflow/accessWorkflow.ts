import { getAppBaseUrl, getSecurityTeam } from "@/lib/config/authEnv";
import {
  cancelTransfer,
  createTransfer,
  createOnboarding,
  deleteOnboarding,
  findRequestByIssueKeyInDraft,
  makeEvent,
  recordActivityInDraft,
  transaction,
} from "@/lib/db/repository";
import type {
  AccessRequest,
  ApprovalReference,
  EmailHandoff,
  Employee,
  EmployeeStatus,
  NewUserInput,
  RequestType,
  TransferInput,
} from "@/lib/types";

import {
  createEmailApproval,
  createSecurityEmailHandoff,
  type AssigneeResolution,
} from "./emailApproval";

/** A decision that came from a recipient acting through an emailed link. */
export type ResolvedSignal = "APPROVED" | "REJECTED" | "SECURITY_DONE";

/**
 * The access-request state machine.
 *
 *   submitOnboardingRequest()   -> new employee + manager approval email
 *   submitTransferRequest()     -> division move for an existing employee
 *   applyIssueStatus()          -> advances a request after an emailed decision
 *
 * Every request type runs the same chain and differs only in the statuses it
 * lands on, so each submit function feeds one `applyIssueStatus`, and the
 * decision page's route funnels into it too. That keeps the transition rules in
 * exactly one place.
 */

/** The employee status at each point of each flow. */
const FLOW = {
  ONBOARDING: {
    awaitingManager: "PENDING_MANAGER_APPROVAL",
    awaitingSecurity: "PENDING_SECURITY_SETUP",
    fulfilled: "ACTIVE",
  },
  TRANSFER: {
    awaitingManager: "PENDING_TRANSFER_APPROVAL",
    awaitingSecurity: "PENDING_TRANSFER_SETUP",
    // A transfer ends by putting the employee back to work, in the new role.
    fulfilled: "ACTIVE",
  },
  OFFBOARDING: {
    awaitingManager: "PENDING_OFFBOARDING_APPROVAL",
    awaitingSecurity: "PENDING_OFFBOARDING_SETUP",
    // Offboarding ends at DISABLED rather than deleting the row: the employee
    // record is what the audit trail and past requests point at, and removing
    // it would orphan them. DISABLED is also reversible, which matters when
    // someone leaves and is rehired.
    fulfilled: "DISABLED",
  },
} as const satisfies Record<RequestType, Record<string, EmployeeStatus>>;

export type TransitionOutcome =
  | "unknown_issue"
  | "duplicate"
  | "ignored"
  | "security_ticket_created"
  | "rejected"
  | "completed";

export interface TransitionResult {
  outcome: TransitionOutcome;
  message: string;
  requestId?: string;
  issueKey?: string;
}

export interface TransitionInput {
  issueKey: string;
  /** What a person reads in the audit trail, e.g. "Disetujui manager". */
  statusName: string;
  /** Name of the email recipient who made the decision. */
  actor?: string;
  /**
   * What the recipient decided.
   *
   * Arrives already resolved — somebody pressed "Setujui", "Tolak" or "Tandai
   * selesai" — so there is nothing to interpret, and `statusName` is purely for
   * the audit trail.
   */
  resolved: ResolvedSignal;
  /** Where the signal came from, for the audit trail. */
  source: "email";
}

/* -------------------------------------------------------------------------- */
/* Step 1 — HC submits the form                                               */
/* -------------------------------------------------------------------------- */

interface ApprovalRequested {
  ref: ApprovalReference;
  assignee: AssigneeResolution;
  approval: EmailHandoff;
}

/**
 * Asks the manager to decide, by email.
 *
 * Returns an `ApprovalReference` alongside the hand-off: it is the handle the
 * rest of the workflow tracks a step by — `applyIssueStatus`, the request cards
 * and the audit trail all key on it.
 */
async function requestEmailHandoff(
  employee: Employee,
  request: AccessRequest,
): Promise<ApprovalRequested> {
  const { ref, assignee, handoff } = await createEmailApproval(
    employee,
    request,
    getAppBaseUrl(),
  );
  return { ref, assignee, approval: handoff };
}

/** How the request records that the manager was asked. */
function approvalRequestedEvents(
  ref: ApprovalReference,
  employee: Employee,
  actor: string,
  approval: EmailHandoff,
  what: string,
) {
  return [
    makeEvent(
      "manager.requested",
      `Permintaan persetujuan ${what} dikirim ke ${employee.managerName} lewat email (${approval.sentTo}). Referensi ${ref.key}.`,
      { actor, issueKey: ref.key },
    ),
    makeEvent(
      "notify.sent",
      `Email persetujuan terkirim ke ${approval.sentTo}; tautannya berlaku sampai ${new Date(approval.expiresAt).toLocaleString("id-ID")}.`,
      { actor: "HC Portal", issueKey: ref.key },
    ),
  ];
}

export async function submitOnboardingRequest(
  input: NewUserInput,
  /** The signed-in HC officer, so the audit trail names a person not a portal. */
  actor = "HC Portal",
): Promise<{ employee: Employee; request: AccessRequest }> {
  const { employee, request } = await createOnboarding(input, actor);

  let created;
  try {
    created = await requestEmailHandoff(employee, request);
  } catch (error) {
    // The employee only exists because of this request; with nobody asked to
    // approve it, it could never progress — so undo the write rather than
    // stranding them in PENDING_MANAGER_APPROVAL forever.
    await deleteOnboarding(request.id);
    throw error;
  }

  const { ref: issue, approval } = created;

  return transaction((draft) => {
    const stored = draft.requests.find((candidate) => candidate.id === request.id);
    if (!stored) throw new Error(`Onboarding request ${request.id} disappeared mid-submit.`);

    stored.managerIssue = issue;
    stored.managerApproval = approval;
    stored.updatedAt = new Date().toISOString();
    stored.events.push(...approvalRequestedEvents(issue, employee, actor, approval, "akun baru"));

    recordActivityInDraft(draft, {
      actor,
      action: "user.created",
      employeeId: employee.id,
      employeeName: employee.displayName,
      detail: `Mengajukan akun baru untuk ${employee.displayName} — ${employee.jobTitle}, ${employee.department}. Ref ${issue.key}.`,
    });

    const storedEmployee = draft.employees.find((candidate) => candidate.id === employee.id)!;
    return { employee: storedEmployee, request: stored };
  });
}

/**
 * HC moves an existing employee to another division.
 *
 * Same chain as onboarding: the manager approves by email, then the security
 * team adjusts the access. Nothing about the employee's position changes until
 * the team marks that adjustment done, so the directory never shows a move that
 * has not actually happened.
 */
export async function submitTransferRequest(
  employeeId: string,
  target: TransferInput,
  actor = "HC Portal",
): Promise<{ employee: Employee; request: AccessRequest }> {
  const { employee, request } = await createTransfer(employeeId, target, actor);

  let created;
  try {
    created = await requestEmailHandoff(employee, request);
  } catch (error) {
    // With nobody asked to approve it the transfer could never progress, and
    // the employee would be stuck showing as pending. Put them back as they were.
    await cancelTransfer(request.id);
    throw error;
  }

  const { ref: issue, approval } = created;

  return transaction((draft) => {
    const stored = draft.requests.find((candidate) => candidate.id === request.id);
    if (!stored) throw new Error(`Access request ${request.id} disappeared mid-submit.`);

    stored.managerIssue = issue;
    stored.managerApproval = approval;
    stored.updatedAt = new Date().toISOString();
    stored.events.push(
      ...approvalRequestedEvents(issue, employee, actor, approval, "pindah divisi"),
    );

    recordActivityInDraft(draft, {
      actor,
      action: "transfer.requested",
      employeeId: employee.id,
      employeeName: employee.displayName,
      detail: `Mengajukan pindah divisi untuk ${employee.displayName} ke ${stored.transfer?.department ?? "divisi baru"}. Ref ${issue.key}.`,
    });

    const storedEmployee = draft.employees.find((candidate) => candidate.id === employee.id)!;
    return { employee: storedEmployee, request: stored };
  });
}

/* -------------------------------------------------------------------------- */
/* Steps 2-4 — an emailed decision drives the request forward                 */
/* -------------------------------------------------------------------------- */

/**
 * The decision is claimed inside a single transaction *before* the next email
 * is sent, so a double-click on the decision page can never send the security
 * team two work orders.
 */
type Claim =
  | { kind: "result"; result: TransitionResult }
  | { kind: "create_security"; employee: Employee; request: AccessRequest; approvedBy?: string };

export async function applyIssueStatus(input: TransitionInput): Promise<TransitionResult> {
  const issueKey = input.issueKey.trim().toUpperCase();
  const signal = `${issueKey}:${input.statusName.trim().toLowerCase()}`;
  const actor = input.actor ?? "Manager (email)";

  const claim = await transaction<Claim>((draft) => {
    const request = findRequestByIssueKeyInDraft(draft, issueKey);
    if (!request) {
      return {
        kind: "result",
        result: {
          outcome: "unknown_issue",
          issueKey,
          message: `Tidak ada pengajuan yang memantau ${issueKey}.`,
        },
      };
    }

    const result = (outcome: TransitionOutcome, message: string): Claim => ({
      kind: "result",
      result: { outcome, message, requestId: request.id, issueKey },
    });

    if (request.processedSignals.includes(signal)) {
      return result("duplicate", `${issueKey} → "${input.statusName}" sudah pernah diproses.`);
    }

    const employee = draft.employees.find((candidate) => candidate.id === request.employeeId);
    if (!employee) {
      return result("ignored", `Request ${request.id} has no employee record.`);
    }

    const now = new Date().toISOString();
    const isManagerIssue = request.managerIssue?.key.toUpperCase() === issueKey;

    /* -- Step 2: the manager's decision -- */
    if (isManagerIssue && request.stage === "MANAGER_APPROVAL") {
      request.managerIssue!.status = input.statusName;

      if (input.resolved !== "APPROVED" && input.resolved !== "REJECTED") {
        request.updatedAt = now;
        return result("ignored", `"${input.statusName}" bukan persetujuan maupun penolakan.`);
      }

      request.processedSignals.push(signal);
      request.updatedAt = now;
      employee.updatedAt = now;

      if (input.resolved === "REJECTED") {
        request.stage = "REJECTED";
        // A refused joiner is REJECTED; a refused transfer simply keeps working
        // where they are, so it goes back to the status held before HC raised this.
        employee.status =
          request.type === "TRANSFER" ? (request.previousStatus ?? "ACTIVE") : "REJECTED";
        employee.activeRequestId = undefined;
        request.events.push(
          makeEvent("manager.rejected", `${actor} menolak pengajuan di ${issueKey}.`, {
            actor,
            issueKey,
          }),
        );
        recordActivityInDraft(draft, {
          actor,
          action: "request.rejected",
          employeeId: employee.id,
          employeeName: employee.displayName,
          detail: `Menolak pengajuan untuk ${employee.displayName} di ${issueKey}.`,
        });
        return result(
          "rejected",
          request.type === "TRANSFER"
            ? `Pemindahan ditolak oleh ${actor}; ${employee.displayName} tetap di posisi semula.`
            : `Pengajuan ditolak oleh ${actor}.`,
        );
      }

      // Approved: move the request on optimistically. If emailing the security
      // team fails, this is rolled back below.
      request.stage = "SECURITY_PROVISIONING";
      employee.status = FLOW[request.type].awaitingSecurity;
      request.events.push(
        makeEvent("manager.approved", `${actor} menyetujui pengajuan di ${issueKey}.`, {
          actor,
          issueKey,
        }),
      );

      recordActivityInDraft(draft, {
        actor,
        action: "request.approved",
        employeeId: employee.id,
        employeeName: employee.displayName,
        detail: `Menyetujui pengajuan untuk ${employee.displayName} di ${issueKey}.`,
      });

      return {
        kind: "create_security",
        employee: { ...employee },
        request: { ...request },
        approvedBy: input.actor,
      };
    }

    /* -- Step 4: the security team finished the work -- */
    const isSecurityIssue = request.securityIssue?.key.toUpperCase() === issueKey;
    if (isSecurityIssue && request.stage === "SECURITY_PROVISIONING") {
      request.securityIssue!.status = input.statusName;

      if (input.resolved !== "SECURITY_DONE") {
        request.updatedAt = now;
        return result("ignored", `"${input.statusName}" tidak menandai penyiapan selesai.`);
      }

      request.processedSignals.push(signal);
      request.stage = "COMPLETED";
      request.updatedAt = now;
      // A transfer only takes effect here: the new position is applied at the
      // moment the security team confirms the access actually changed.
      if (request.type === "TRANSFER" && request.transfer) {
        employee.department = request.transfer.department;
        employee.jobTitle = request.transfer.jobTitle;
        if (request.transfer.managerName) employee.managerName = request.transfer.managerName;
        if (request.transfer.managerEmail) {
          employee.managerEmail = request.transfer.managerEmail;
          // A legacy field from the Jira days; cleared so it can never describe
          // the previous manager.
          employee.managerAccountId = undefined;
        }
      }

      employee.status =
        request.type === "TRANSFER"
          ? (request.previousStatus ?? "ACTIVE")
          : FLOW[request.type].fulfilled;
      employee.activeRequestId = undefined;
      employee.updatedAt = now;
      const outcome =
        request.type === "TRANSFER"
          ? `pindah ke ${employee.department} sebagai ${employee.jobTitle}`
          : request.type === "OFFBOARDING"
            ? "Dinonaktifkan"
            : "Aktif";
      request.events.push(
        makeEvent(
          "security.completed",
          `${actor} menandai ${issueKey} selesai; ${employee.displayName} sekarang ${outcome}.`,
          { actor, issueKey },
        ),
      );
      recordActivityInDraft(draft, {
        actor,
        action: "request.completed",
        employeeId: employee.id,
        employeeName: employee.displayName,
        detail: `Menandai penyiapan ${issueKey} selesai; ${employee.displayName} sekarang ${outcome}.`,
      });
      return result("completed", `${employee.displayName} sekarang ${outcome}.`);
    }

    return result(
      "ignored",
      `${issueKey} menerima "${input.statusName}", tetapi pengajuannya sedang di tahap ${request.stage}.`,
    );
  });

  if (claim.kind === "result") return claim.result;

  return raiseSecurityTicket(claim, signal, actor);
}

/** Hands the provisioning job to the security team, by email. */
async function handOverToSecurity(
  employee: Employee,
  request: AccessRequest,
  approvedBy: string | undefined,
): Promise<ApprovalRequested> {
  const { ref, assignee, handoff } = await createSecurityEmailHandoff(
    employee,
    request,
    getAppBaseUrl(),
    getSecurityTeam(),
    approvedBy,
  );
  return { ref, assignee, approval: handoff };
}

/** Step 3 — hand the job to the security team, or undo the approval if that fails. */
async function raiseSecurityTicket(
  claim: Extract<Claim, { kind: "create_security" }>,
  signal: string,
  actor: string,
): Promise<TransitionResult> {
  const { employee, request } = claim;

  let created;
  try {
    created = await handOverToSecurity(employee, request, claim.approvedBy);
  } catch (error) {
    await rollbackApproval(request.id, signal);
    throw error;
  }

  const { ref: issue, assignee, approval } = created;

  return transaction<TransitionResult>((draft) => {
    const stored = draft.requests.find((candidate) => candidate.id === request.id);
    if (!stored) {
      return {
        outcome: "ignored",
        message: `Request ${request.id} vanished while ${issue.key} was being sent.`,
        issueKey: issue.key,
      };
    }

    stored.securityIssue = issue;
    stored.securityApproval = approval;
    stored.updatedAt = new Date().toISOString();
    const noun =
      request.type === "TRANSFER"
        ? "Penyesuaian akses"
        : request.type === "OFFBOARDING"
          ? "Pencabutan akses"
          : "Penyiapan akses";
    stored.events.push(
      makeEvent(
        "security.requested",
        `Permintaan ${noun.toLowerCase()} dikirim ke ${assignee.displayName ?? "IT Security"} lewat email (${approval.sentTo}). Referensi ${issue.key}.`,
        { actor: "HC Portal", issueKey: issue.key },
      ),
      makeEvent(
        "notify.sent",
        `Email penyiapan terkirim ke ${approval.sentTo}; tautannya berlaku sampai ${new Date(approval.expiresAt).toLocaleString("id-ID")}.`,
        { actor: "HC Portal", issueKey: issue.key },
      ),
    );

    return {
      outcome: "security_ticket_created",
      message: `Disetujui oleh ${actor}; permintaan ${noun.toLowerCase()} dikirim ke ${assignee.displayName ?? "tim keamanan"}.`,
      requestId: stored.id,
      issueKey: issue.key,
    };
  });
}

/** Puts a request back to MANAGER_APPROVAL when the security team could not be emailed. */
async function rollbackApproval(requestId: string, signal: string): Promise<void> {
  await transaction((draft) => {
    const request = draft.requests.find((candidate) => candidate.id === requestId);
    if (!request) return;

    request.stage = "MANAGER_APPROVAL";
    request.processedSignals = request.processedSignals.filter((entry) => entry !== signal);
    request.events.push(
      makeEvent(
        "security.request_failed",
        "Email IT Security gagal dikirim; persetujuan dapat dicoba ulang.",
        { actor: "HC Portal" },
      ),
    );

    const employee = draft.employees.find((candidate) => candidate.id === request.employeeId);
    if (employee) employee.status = FLOW[request.type].awaitingManager;
  });
}
