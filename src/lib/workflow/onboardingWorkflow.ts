import { getJiraConfig } from "@/lib/config/env";
import {
  createOnboarding,
  deleteOnboarding,
  findRequestByIssueKeyInDraft,
  listOpenRequests,
  makeEvent,
  transaction,
} from "@/lib/db/repository";
import {
  commentOnIssue,
  createManagerApprovalIssue,
  createSecurityProvisioningIssue,
  fetchIssueStatus,
} from "@/lib/jira/jiraService";
import type { Employee, NewUserInput, OnboardingRequest } from "@/lib/types";

import { classifyManagerStatus, isSecurityComplete } from "./statusRules";

/**
 * The onboarding state machine.
 *
 *   submitOnboardingRequest()  -> creates the employee + manager approval ticket
 *   applyIssueStatus()         -> advances the request when a Jira status changes
 *   syncOpenRequests()         -> polling fallback that calls applyIssueStatus()
 *
 * Both the webhook route and the polling route funnel into `applyIssueStatus`,
 * so the transition rules exist in exactly one place.
 */

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
): Promise<{ employee: Employee; request: OnboardingRequest }> {
  const { employee, request } = await createOnboarding(input);

  let issue;
  try {
    issue = await createManagerApprovalIssue(employee, request);
  } catch (error) {
    // The employee only exists because of this request; without a manager
    // ticket it could never progress, so undo the write rather than stranding it.
    await deleteOnboarding(request.id);
    throw error;
  }

  return transaction((draft) => {
    const stored = draft.requests.find((candidate) => candidate.id === request.id);
    if (!stored) throw new Error(`Onboarding request ${request.id} disappeared mid-submit.`);

    stored.managerIssue = issue;
    stored.updatedAt = new Date().toISOString();
    stored.events.push(
      makeEvent(
        "manager.requested",
        `Approval ticket ${issue.key} raised for ${employee.managerName}.`,
        { actor: "HC Portal", issueKey: issue.key },
      ),
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
  | { kind: "create_security"; employee: Employee; request: OnboardingRequest; approvedBy?: string };

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
          message: `No onboarding request is tracking ${issueKey}.`,
        },
      };
    }

    const result = (outcome: TransitionOutcome, message: string): Claim => ({
      kind: "result",
      result: { outcome, message, requestId: request.id, issueKey },
    });

    if (request.processedSignals.includes(signal)) {
      return result("duplicate", `${issueKey} → "${input.statusName}" was already processed.`);
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
        return result("ignored", `"${input.statusName}" is not an approval or rejection status.`);
      }

      request.processedSignals.push(signal);
      request.updatedAt = now;
      employee.updatedAt = now;

      if (decision === "REJECTED") {
        request.stage = "REJECTED";
        employee.status = "REJECTED";
        request.events.push(
          makeEvent("manager.rejected", `${actor} rejected the request on ${issueKey}.`, {
            actor,
            issueKey,
          }),
        );
        return result("rejected", `Request rejected by ${actor}.`);
      }

      // Approved: move the request on optimistically. If raising the security
      // ticket fails we roll this back below.
      request.stage = "SECURITY_PROVISIONING";
      employee.status = "PENDING_SECURITY_SETUP";
      request.events.push(
        makeEvent("manager.approved", `${actor} approved the request on ${issueKey}.`, {
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
        return result("ignored", `"${input.statusName}" does not close the provisioning ticket.`);
      }

      request.processedSignals.push(signal);
      request.stage = "COMPLETED";
      request.updatedAt = now;
      employee.status = "ACTIVE";
      employee.updatedAt = now;
      request.events.push(
        makeEvent(
          "security.completed",
          `${actor} closed ${issueKey}; ${employee.name} is now Active.`,
          { actor, issueKey },
        ),
      );
      return result("completed", `${employee.name} is now Active.`);
    }

    return result(
      "ignored",
      `${issueKey} moved to "${input.statusName}" but the request is at stage ${request.stage}.`,
    );
  });

  if (claim.kind === "result") return claim.result;

  return raiseSecurityTicket(claim, signal, actor);
}

/** Step 3 — raise the IT Security ticket, or undo the approval if Jira refuses. */
async function raiseSecurityTicket(
  claim: Extract<Claim, { kind: "create_security" }>,
  signal: string,
  actor: string,
): Promise<TransitionResult> {
  const { employee, request } = claim;

  let issue;
  try {
    issue = await createSecurityProvisioningIssue(employee, request, claim.approvedBy);
  } catch (error) {
    await rollbackApproval(request.id, signal);
    throw error;
  }

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
    stored.events.push(
      makeEvent("security.requested", `Provisioning ticket ${issue.key} raised for IT Security.`, {
        actor: "HC Portal",
        issueKey: issue.key,
      }),
    );

    return {
      outcome: "security_ticket_created",
      message: `Approved by ${actor}; provisioning ticket ${issue.key} raised.`,
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
        "Could not raise the IT Security ticket in Jira; the approval will be retried.",
        { actor: "HC Portal" },
      ),
    );

    const employee = draft.employees.find((candidate) => candidate.id === request.employeeId);
    if (employee) employee.status = "PENDING_MANAGER_APPROVAL";
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
