import { getJiraConfig } from "@/lib/config/env";
import {
  cancelTransfer,
  createTransfer,
  createOnboarding,
  deleteOnboarding,
  findRequestByIssueKeyInDraft,
  listOpenRequests,
  makeEvent,
  transaction,
} from "@/lib/db/repository";
import {
  commentOnIssue,
  createApprovalIssue,
  createFulfilmentIssue,
  fetchIssueStatus,
  type AssigneeResolution,
} from "@/lib/jira/jiraService";
import type {
  AccessRequest,
  Employee,
  EmployeeStatus,
  NewUserInput,
  RequestType,
  TransferInput,
} from "@/lib/types";

import { classifyManagerStatus, isSecurityComplete } from "./statusRules";

/**
 * The onboarding state machine.
 *
 *   submitOnboardingRequest()   -> new employee + manager approval ticket
 *   submitOffboardingRequest()  -> removal request for an existing employee
 *   applyIssueStatus()          -> advances a request when a Jira status changes
 *   syncOpenRequests()          -> polling fallback that calls applyIssueStatus()
 *
 * Adding and removing an account run the same chain and differ only in the
 * statuses they land on, so both submit functions feed one `applyIssueStatus`.
 * The webhook route and the polling route funnel into it too, which keeps the
 * transition rules in exactly one place.
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
  statusName: string;
  /** Jira display name of whoever moved the ticket. */
  actor?: string;
  /** Where the signal came from, for the audit trail. */
  source: "webhook" | "polling";
}

/* -------------------------------------------------------------------------- */
/* Step 1 — HC submits the form                                               */
/* -------------------------------------------------------------------------- */

export async function submitOnboardingRequest(
  input: NewUserInput,
): Promise<{ employee: Employee; request: AccessRequest }> {
  const { employee, request } = await createOnboarding(input);

  let created;
  try {
    created = await createApprovalIssue(employee, request);
  } catch (error) {
    // The employee only exists because of this request; without a manager
    // ticket it could never progress, so undo the write rather than stranding it.
    await deleteOnboarding(request.id);
    throw error;
  }

  const { ref: issue, assignee } = created;

  return transaction((draft) => {
    const stored = draft.requests.find((candidate) => candidate.id === request.id);
    if (!stored) throw new Error(`Onboarding request ${request.id} disappeared mid-submit.`);

    stored.managerIssue = issue;
    stored.updatedAt = new Date().toISOString();
    stored.events.push(
      makeEvent(
        "manager.requested",
        `Tiket persetujuan ${issue.key} dibuat untuk ${employee.managerName}.`,
        { actor: "HC Portal", issueKey: issue.key },
      ),
      notificationEvent(issue.key, assignee, employee.managerEmail),
    );

    const storedEmployee = draft.employees.find((candidate) => candidate.id === employee.id)!;
    return { employee: storedEmployee, request: stored };
  });
}

/**
 * HC moves an existing employee to another division.
 *
 * Same chain as onboarding: the manager approves in Jira, then IT Security
 * adjusts the access. Nothing about the employee's position changes until IT
 * Security closes the second ticket, so the directory never shows a move that
 * has not actually happened.
 */
export async function submitTransferRequest(
  employeeId: string,
  target: TransferInput,
): Promise<{ employee: Employee; request: AccessRequest }> {
  const { employee, request } = await createTransfer(employeeId, target);

  let created;
  try {
    created = await createApprovalIssue(employee, request);
  } catch (error) {
    // Without an approval ticket the transfer could never progress, and the
    // employee would be stuck showing as pending. Put them back as they were.
    await cancelTransfer(request.id);
    throw error;
  }

  const { ref: issue, assignee } = created;

  return transaction((draft) => {
    const stored = draft.requests.find((candidate) => candidate.id === request.id);
    if (!stored) throw new Error(`Access request ${request.id} disappeared mid-submit.`);

    stored.managerIssue = issue;
    stored.updatedAt = new Date().toISOString();
    stored.events.push(
      makeEvent(
        "manager.requested",
        `Tiket persetujuan pindah divisi ${issue.key} dibuat untuk ${employee.managerName}.`,
        { actor: "HC Portal", issueKey: issue.key },
      ),
      notificationEvent(issue.key, assignee, employee.managerEmail),
    );

    const storedEmployee = draft.employees.find((candidate) => candidate.id === employee.id)!;
    return { employee: storedEmployee, request: stored };
  });
}

/* -------------------------------------------------------------------------- */
/* Steps 2-4 — Jira drives the request forward                                */
/* -------------------------------------------------------------------------- */

/**
 * Claiming happens inside a single transaction *before* any Jira call, so a
 * duplicate webhook delivery can never raise two security tickets.
 */
type Claim =
  | { kind: "result"; result: TransitionResult }
  | { kind: "create_security"; employee: Employee; request: AccessRequest; approvedBy?: string };

export async function applyIssueStatus(input: TransitionInput): Promise<TransitionResult> {
  const config = getJiraConfig();
  const issueKey = input.issueKey.trim().toUpperCase();
  const signal = `${issueKey}:${input.statusName.trim().toLowerCase()}`;
  const actor = input.actor ?? (input.source === "polling" ? "Jira sync" : "Jira");

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
      const decision = classifyManagerStatus(input.statusName, config);

      if (decision === "PENDING") {
        request.updatedAt = now;
        return result("ignored", `"${input.statusName}" bukan status persetujuan maupun penolakan.`);
      }

      request.processedSignals.push(signal);
      request.updatedAt = now;
      employee.updatedAt = now;

      if (decision === "REJECTED") {
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
        return result(
          "rejected",
          request.type === "TRANSFER"
            ? `Pemindahan ditolak oleh ${actor}; ${employee.displayName} tetap di posisi semula.`
            : `Pengajuan ditolak oleh ${actor}.`,
        );
      }

      // Approved: move the request on optimistically. If raising the security
      // ticket fails we roll this back below.
      request.stage = "SECURITY_PROVISIONING";
      employee.status = FLOW[request.type].awaitingSecurity;
      request.events.push(
        makeEvent("manager.approved", `${actor} menyetujui pengajuan di ${issueKey}.`, {
          actor,
          issueKey,
        }),
      );

      return {
        kind: "create_security",
        employee: { ...employee },
        request: { ...request },
        approvedBy: input.actor,
      };
    }

    /* -- Step 4: IT Security finished provisioning -- */
    const isSecurityIssue = request.securityIssue?.key.toUpperCase() === issueKey;
    if (isSecurityIssue && request.stage === "SECURITY_PROVISIONING") {
      request.securityIssue!.status = input.statusName;

      if (!isSecurityComplete(input.statusName, config)) {
        request.updatedAt = now;
        return result("ignored", `"${input.statusName}" tidak menutup tiket IT Security.`);
      }

      request.processedSignals.push(signal);
      request.stage = "COMPLETED";
      request.updatedAt = now;
      // A transfer only takes effect here: the new position is applied at the
      // moment IT Security confirms the access actually changed.
      if (request.type === "TRANSFER" && request.transfer) {
        employee.department = request.transfer.department;
        employee.jobTitle = request.transfer.jobTitle;
        if (request.transfer.managerName) employee.managerName = request.transfer.managerName;
        if (request.transfer.managerEmail) {
          employee.managerEmail = request.transfer.managerEmail;
          // The cached accountId belongs to the old manager; drop it so the next
          // request resolves the new one from their email.
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
          : "Aktif";
      request.events.push(
        makeEvent(
          "security.completed",
          `${actor} menutup ${issueKey}; ${employee.displayName} sekarang ${outcome}.`,
          { actor, issueKey },
        ),
      );
      return result("completed", `${employee.displayName} sekarang ${outcome}.`);
    }

    return result(
      "ignored",
      `${issueKey} moved to "${input.statusName}" but the request is at stage ${request.stage}.`,
    );
  });

  if (claim.kind === "result") return claim.result;

  return raiseSecurityTicket(claim, signal, actor);
}

/**
 * Records whether the ticket actually reached a person.
 *
 * Jira's notification scheme emails the assignee when an issue is created, so
 * an assigned ticket means the approver has been told. An unassigned one is
 * silent, and HC needs to see that rather than assume the email went out.
 */
function notificationEvent(
  issueKey: string,
  assignee: AssigneeResolution,
  email: string | undefined,
) {
  if (assignee.problem) {
    return makeEvent("notify.failed", `Tidak ada yang dinotifikasi: ${assignee.problem}`, {
      actor: "HC Portal",
      issueKey,
    });
  }

  const who = assignee.displayName ?? email ?? "assignee";
  return makeEvent(
    "notify.sent",
    `${issueKey} di-assign ke ${who}, jadi Jira mengirimkan email pengajuan ini ke mereka.`,
    { actor: "HC Portal", issueKey },
  );
}

/** Step 3 — raise the IT Security ticket, or undo the approval if Jira refuses. */
async function raiseSecurityTicket(
  claim: Extract<Claim, { kind: "create_security" }>,
  signal: string,
  actor: string,
): Promise<TransitionResult> {
  const { employee, request } = claim;

  let created;
  try {
    created = await createFulfilmentIssue(employee, request, claim.approvedBy);
  } catch (error) {
    await rollbackApproval(request.id, signal);
    throw error;
  }

  const { ref: issue, assignee } = created;

  const result = await transaction<TransitionResult>((draft) => {
    const stored = draft.requests.find((candidate) => candidate.id === request.id);
    if (!stored) {
      return {
        outcome: "ignored",
        message: `Request ${request.id} vanished while ${issue.key} was being raised.`,
        issueKey: issue.key,
      };
    }

    stored.securityIssue = issue;
    stored.updatedAt = new Date().toISOString();
    const noun = request.type === "TRANSFER" ? "Penyesuaian akses" : "Penyiapan akses";
    stored.events.push(
      makeEvent("security.requested", `Tiket ${noun.toLowerCase()} ${issue.key} dibuat untuk IT Security.`, {
        actor: "HC Portal",
        issueKey: issue.key,
      }),
      notificationEvent(issue.key, assignee, getJiraConfig().securityAssigneeEmail),
    );

    return {
      outcome: "security_ticket_created",
      message: `Disetujui oleh ${actor}; tiket ${noun.toLowerCase()} ${issue.key} dibuat.`,
      requestId: stored.id,
      issueKey: issue.key,
    };
  });

  if (request.managerIssue) {
    await commentOnIssue(
      request.managerIssue.key,
      `Approval recorded. IT Security provisioning is tracked in ${issue.key}.`,
    );
  }

  return result;
}

/** Puts a request back to MANAGER_APPROVAL after a failed security-ticket creation. */
async function rollbackApproval(requestId: string, signal: string): Promise<void> {
  await transaction((draft) => {
    const request = draft.requests.find((candidate) => candidate.id === requestId);
    if (!request) return;

    request.stage = "MANAGER_APPROVAL";
    request.processedSignals = request.processedSignals.filter((entry) => entry !== signal);
    request.events.push(
      makeEvent(
        "security.request_failed",
        "Tiket IT Security gagal dibuat di Jira; persetujuan akan dicoba ulang.",
        { actor: "HC Portal" },
      ),
    );

    const employee = draft.employees.find((candidate) => candidate.id === request.employeeId);
    if (employee) employee.status = FLOW[request.type].awaitingManager;
  });
}

/* -------------------------------------------------------------------------- */
/* Polling fallback                                                           */
/* -------------------------------------------------------------------------- */

export interface SyncSummary {
  checked: number;
  advanced: number;
  results: TransitionResult[];
}

/**
 * Reconciles every open request against Jira. Useful when webhooks cannot reach
 * the app (local development, or an outage that dropped deliveries).
 */
export async function syncOpenRequests(): Promise<SyncSummary> {
  const open = await listOpenRequests();
  const results: TransitionResult[] = [];

  for (const request of open) {
    const issue = request.stage === "MANAGER_APPROVAL" ? request.managerIssue : request.securityIssue;
    if (!issue) continue;

    try {
      const statusName = await fetchIssueStatus(issue.key);
      if (!statusName) continue;
      results.push(await applyIssueStatus({ issueKey: issue.key, statusName, source: "polling" }));
    } catch (error) {
      results.push({
        outcome: "ignored",
        issueKey: issue.key,
        requestId: request.id,
        message: `Could not read ${issue.key} from Jira: ${(error as Error).message}`,
      });
    }
  }

  const advanced = results.filter(
    (result) =>
      result.outcome === "security_ticket_created" ||
      result.outcome === "rejected" ||
      result.outcome === "completed",
  ).length;

  return { checked: open.length, advanced, results };
}
