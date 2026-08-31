import { getJiraConfig } from "@/lib/config/env";
import type { Employee, JiraIssueRef, OnboardingRequest } from "@/lib/types";

import { detailList, doc, heading, link, paragraph, rule, strong, text } from "./adf";
import { getJiraClient } from "./jiraClient";

/**
 * Domain-level Jira operations for the onboarding workflow.
 *
 * `jiraClient.ts` knows how to talk to Jira; this module knows *what* the HC
 * process needs to say. Keeping the two apart means ticket copy can change
 * without touching transport code, and vice versa.
 */

function appBaseUrl(): string | undefined {
  return process.env.APP_BASE_URL?.trim() || undefined;
}

function requestLink(request: OnboardingRequest) {
  const base = appBaseUrl();
  return base ? link("Open the request in the HC dashboard", `${base}/requests`) : text(request.id);
}

function employeeDetails(employee: Employee): Array<[string, string]> {
  return [
    ["Full name", employee.name],
    ["Work email", employee.email],
    ["Job title", employee.jobTitle],
    ["Department", employee.department],
    ["Reporting manager", employee.managerName],
  ];
}

/**
 * Step 1 — asks the new joiner's manager to approve the hire.
 * Assigned to the manager when HC supplied their Jira accountId.
 */
export async function createManagerApprovalIssue(
  employee: Employee,
  request: OnboardingRequest,
): Promise<JiraIssueRef> {
  const config = getJiraConfig();
  const client = getJiraClient();
  const approved = config.approvedStatuses.join(" / ");
  const rejected = config.rejectedStatuses.join(" / ");

  const issue = await client.createIssue({
    issueType: config.managerIssueType,
    assigneeAccountId: employee.managerAccountId,
    labels: ["hc-onboarding", "manager-approval"],
    summary: `[Approval] New user access for ${employee.name} (${employee.jobTitle})`,
    description: doc(
      heading(2, "Manager approval required"),
      paragraph(
        text("Human Capital has requested a new user account for "),
        strong(employee.name),
        text(". Please review the details below and approve or reject this request."),
      ),
      heading(3, "New joiner details"),
      detailList(employeeDetails(employee)),
      rule(),
      heading(3, "How to respond"),
      paragraph(
        text("Transition this ticket to "),
        strong(approved),
        text(" to approve, or "),
        strong(rejected),
        text(
          " to reject. On approval the HC system automatically raises a provisioning ticket for IT Security.",
        ),
      ),
      paragraph(requestLink(request)),
    ),
  });

  return { key: issue.key, url: issue.url, status: issue.status };
}

/**
 * Step 3 — raised automatically once the manager approves. Assigned to the IT
 * Security team account from `JIRA_SECURITY_ACCOUNT_ID`.
 */
export async function createSecurityProvisioningIssue(
  employee: Employee,
  request: OnboardingRequest,
  approvedBy?: string,
): Promise<JiraIssueRef> {
  const config = getJiraConfig();
  const client = getJiraClient();
  const done = config.securityDoneStatuses.join(" / ");

  const issue = await client.createIssue({
    issueType: config.securityIssueType,
    assigneeAccountId: config.securityAssigneeAccountId,
    labels: ["hc-onboarding", "security-provisioning"],
    summary: `[Provisioning] Set up accounts and access for ${employee.name}`,
    description: doc(
      heading(2, "Account provisioning request"),
      paragraph(
        text("Manager approval is complete"),
        approvedBy ? text(` (approved by ${approvedBy})`) : text(""),
        text(". Please provision accounts and baseline access for the new joiner below."),
      ),
      heading(3, "New joiner details"),
      detailList([
        ...employeeDetails(employee),
        ["Manager approval ticket", request.managerIssue?.key ?? "n/a"],
      ]),
      heading(3, "Checklist"),
      paragraph(
        text(
          "Directory account, email mailbox, SSO enrolment, VPN profile, and the department's baseline application roles.",
        ),
      ),
      rule(),
      paragraph(
        text("Transition this ticket to "),
        strong(done),
        text(" when provisioning is finished — the HC dashboard then flips "),
        strong(employee.name),
        text(" to Active automatically."),
      ),
      paragraph(requestLink(request)),
    ),
  });

  return { key: issue.key, url: issue.url, status: issue.status };
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
