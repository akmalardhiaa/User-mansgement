import { getJiraConfig } from "@/lib/config/env";
import type { Employee, JiraIssueRef, AccessRequest } from "@/lib/types";

import { detailList, doc, heading, link, paragraph, rule, strong, text } from "./adf";
import { getJiraClient } from "./jiraClient";

/**
 * Who a ticket ended up assigned to.
 *
 * This matters beyond bookkeeping: Jira's notification scheme emails the
 * assignee when an issue is created, and that email is how managers and the IT
 * Security team learn there is something to approve. An unassigned ticket is a
 * silent one, so the reason for a failed lookup is surfaced rather than
 * swallowed.
 */
export interface AssigneeResolution {
  accountId?: string;
  displayName?: string;
  /** Set when nobody could be assigned; shown to HC and in the audit trail. */
  problem?: string;
}

/**
 * Turns an email address into a Jira accountId. An explicit accountId always
 * wins, so an operator can override a lookup that picks the wrong person.
 */
async function resolveAssignee(params: {
  accountId?: string;
  email?: string;
  role: string;
}): Promise<AssigneeResolution> {
  if (params.accountId) return { accountId: params.accountId };
  if (!params.email) {
    return { problem: `No ${params.role} email was provided, so the ticket is unassigned.` };
  }

  try {
    const user = await getJiraClient().findUserByEmail(params.email);
    if (!user) {
      return {
        problem: `No Jira account matches ${params.email}, so the ticket is unassigned and Jira will not email the ${params.role}.`,
      };
    }
    return { accountId: user.accountId, displayName: user.displayName };
  } catch (error) {
    // A failed lookup must not block the request: an unassigned ticket that
    // exists is far better than no ticket at all.
    return {
      problem: `Could not look up ${params.email} in Jira (${(error as Error).message}); the ticket is unassigned.`,
    };
  }
}

/**
 * Domain-level Jira operations for the access-request workflow.
 *
 * `jiraClient.ts` knows how to talk to Jira; this module knows *what* the HC
 * process needs to say. Onboarding and offboarding share the same two-step
 * chain, so they share the machinery here and differ only in their wording —
 * which keeps the two flows from drifting apart as the copy changes.
 */

function appBaseUrl(): string | undefined {
  return process.env.APP_BASE_URL?.trim() || undefined;
}

function requestLink(request: AccessRequest) {
  const base = appBaseUrl();
  return base ? link("Open the request in the HC dashboard", `${base}/requests`) : text(request.id);
}

function employeeDetails(employee: Employee): Array<[string, string]> {
  return [
    ["Full name", employee.name],
    ["Work email", employee.email],
    ["Job title", employee.jobTitle],
    ["Department", employee.department],
    ["Reporting manager", `${employee.managerName} (${employee.managerEmail})`],
  ];
}

/** Wording that differs between adding and removing an account. */
const COPY = {
  ONBOARDING: {
    approvalSummary: (e: Employee) => `[Approval] New user access for ${e.name} (${e.jobTitle})`,
    approvalHeading: "Manager approval required",
    approvalIntro: "Human Capital has requested a new user account for ",
    approvalOutcome:
      " On approval the HC system automatically raises a provisioning ticket for IT Security.",
    approvalLabels: ["hc-onboarding", "manager-approval"],
    detailsHeading: "New joiner details",

    fulfilSummary: (e: Employee) => `[Provisioning] Set up accounts and access for ${e.name}`,
    fulfilHeading: "Account provisioning request",
    fulfilIntro: "Please provision accounts and baseline access for the person below.",
    fulfilChecklist:
      "Directory account, email mailbox, SSO enrolment, VPN profile, and the department's baseline application roles.",
    fulfilOutcome: (e: Employee) => [
      " when provisioning is finished — the HC dashboard then flips ",
      e.name,
      " to Active automatically.",
    ] as const,
    fulfilLabels: ["hc-onboarding", "security-provisioning"],
  },
  OFFBOARDING: {
    approvalSummary: (e: Employee) => `[Approval] Remove user access for ${e.name} (${e.jobTitle})`,
    approvalHeading: "Manager approval required — access removal",
    approvalIntro: "Human Capital has requested that all access be revoked for ",
    approvalOutcome:
      " On approval the HC system automatically raises a deprovisioning ticket for IT Security.",
    approvalLabels: ["hc-offboarding", "manager-approval"],
    detailsHeading: "Employee details",

    fulfilSummary: (e: Employee) => `[Deprovisioning] Revoke accounts and access for ${e.name}`,
    fulfilHeading: "Account deprovisioning request",
    fulfilIntro: "Please revoke all accounts and access for the person below.",
    fulfilChecklist:
      "Disable the directory account, revoke SSO and VPN, remove application roles, transfer or archive the mailbox, and collect any issued credentials.",
    fulfilOutcome: (e: Employee) => [
      " when deprovisioning is finished — the HC dashboard then marks ",
      e.name,
      " as Removed automatically.",
    ] as const,
    fulfilLabels: ["hc-offboarding", "security-deprovisioning"],
  },
} as const;

/**
 * Step 1 — asks the employee's manager to approve the request.
 * Assigned by resolving the manager's email, which is what makes Jira email them.
 */
export async function createApprovalIssue(
  employee: Employee,
  request: AccessRequest,
): Promise<{ ref: JiraIssueRef; assignee: AssigneeResolution }> {
  const config = getJiraConfig();
  const client = getJiraClient();
  const copy = COPY[request.type];
  const approved = config.approvedStatuses.join(" / ");
  const rejected = config.rejectedStatuses.join(" / ");

  const assignee = await resolveAssignee({
    accountId: employee.managerAccountId,
    email: employee.managerEmail,
    role: "manager",
  });

  const details = employeeDetails(employee);
  if (request.reason) details.push(["Reason given by HC", request.reason]);

  const issue = await client.createIssue({
    issueType: config.managerIssueType,
    assigneeAccountId: assignee.accountId,
    labels: [...copy.approvalLabels],
    summary: copy.approvalSummary(employee),
    description: doc(
      heading(2, copy.approvalHeading),
      paragraph(
        text(copy.approvalIntro),
        strong(employee.name),
        text(". Please review the details below and approve or reject this request."),
      ),
      heading(3, copy.detailsHeading),
      detailList(details),
      rule(),
      heading(3, "How to respond"),
      paragraph(
        text("Transition this ticket to "),
        strong(approved),
        text(" to approve, or "),
        strong(rejected),
        text(" to reject."),
        text(copy.approvalOutcome),
      ),
      paragraph(requestLink(request)),
    ),
  });

  return {
    ref: {
      key: issue.key,
      url: issue.url,
      status: issue.status,
      assignee: assignee.displayName ?? (assignee.accountId ? employee.managerName : undefined),
    },
    assignee,
  };
}

/**
 * Step 3 — raised automatically once the manager approves. Assigned to the IT
 * Security team from `JIRA_SECURITY_ACCOUNT_ID` or `JIRA_SECURITY_EMAIL`.
 */
export async function createFulfilmentIssue(
  employee: Employee,
  request: AccessRequest,
  approvedBy?: string,
): Promise<{ ref: JiraIssueRef; assignee: AssigneeResolution }> {
  const config = getJiraConfig();
  const client = getJiraClient();
  const copy = COPY[request.type];
  const done = config.securityDoneStatuses.join(" / ");
  const [before, name, after] = copy.fulfilOutcome(employee);

  const assignee = await resolveAssignee({
    accountId: config.securityAssigneeAccountId,
    email: config.securityAssigneeEmail,
    role: "IT Security",
  });

  const details = employeeDetails(employee);
  details.push(["Manager approval ticket", request.managerIssue?.key ?? "n/a"]);
  if (request.reason) details.push(["Reason given by HC", request.reason]);

  const issue = await client.createIssue({
    issueType: config.securityIssueType,
    assigneeAccountId: assignee.accountId,
    labels: [...copy.fulfilLabels],
    summary: copy.fulfilSummary(employee),
    description: doc(
      heading(2, copy.fulfilHeading),
      paragraph(
        text("Manager approval is complete"),
        approvedBy ? text(` (approved by ${approvedBy})`) : text(""),
        text(". "),
        text(copy.fulfilIntro),
      ),
      heading(3, copy.detailsHeading),
      detailList(details),
      heading(3, "Checklist"),
      paragraph(text(copy.fulfilChecklist)),
      rule(),
      paragraph(
        text("Transition this ticket to "),
        strong(done),
        text(before),
        strong(name),
        text(after),
      ),
      paragraph(requestLink(request)),
    ),
  });

  return {
    ref: {
      key: issue.key,
      url: issue.url,
      status: issue.status,
      assignee: assignee.displayName ?? (assignee.accountId ? "IT Security" : undefined),
    },
    assignee,
  };
}

/** Reads the current status name of an issue — used by the polling fallback. */
export async function fetchIssueStatus(issueKey: string): Promise<string | undefined> {
  const issue = await getJiraClient().getIssue(issueKey);
  return issue.status;
}

/** Best-effort audit comment. Never fails the workflow it is annotating. */
export async function commentOnIssue(issueKey: string, message: string): Promise<void> {
  try {
    await getJiraClient().addComment(issueKey, doc(paragraph(message)));
  } catch (error) {
    console.warn(`[jira] could not comment on ${issueKey}:`, error);
  }
}
