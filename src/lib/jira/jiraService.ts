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
    return { problem: `Email ${params.role} tidak diisi, jadi tiket tidak ter-assign.` };
  }

  try {
    const user = await getJiraClient().findUserByEmail(params.email);
    if (!user) {
      return {
        problem: `Tidak ada akun Jira yang cocok dengan ${params.email}, jadi tiket tidak ter-assign dan Jira tidak mengirim email ke ${params.role}.`,
      };
    }
    return { accountId: user.accountId, displayName: user.displayName };
  } catch (error) {
    // A failed lookup must not block the request: an unassigned ticket that
    // exists is far better than no ticket at all.
    return {
      problem: `Gagal mencari ${params.email} di Jira (${(error as Error).message}); tiket tidak ter-assign.`,
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
  return base ? link("Buka pengajuan di dashboard HC", `${base}/requests`) : text(request.id);
}

function employeeDetails(employee: Employee): Array<[string, string]> {
  return [
    ["Nama lengkap", employee.name],
    ["Email kantor", employee.email],
    ["Jabatan", employee.jobTitle],
    ["Departemen", employee.department],
    ["Manager", `${employee.managerName} (${employee.managerEmail})`],
  ];
}

/** Wording that differs between adding and removing an account. */
const COPY = {
  ONBOARDING: {
    approvalSummary: (e: Employee) => `[Persetujuan] Akun baru untuk ${e.name} (${e.jobTitle})`,
    approvalHeading: "Butuh persetujuan manager",
    approvalIntro: "Human Capital mengajukan pembuatan akun baru untuk ",
    approvalOutcome:
      " Setelah disetujui, sistem HC otomatis membuat tiket penyiapan akses untuk IT Security.",
    approvalLabels: ["hc-onboarding", "manager-approval"],
    detailsHeading: "Data karyawan baru",

    fulfilSummary: (e: Employee) => `[Penyiapan] Siapkan akun dan akses untuk ${e.name}`,
    fulfilHeading: "Permintaan penyiapan akun",
    fulfilIntro: "Mohon siapkan akun dan akses dasar untuk karyawan berikut.",
    fulfilChecklist:
      "Akun direktori, mailbox email, pendaftaran SSO, profil VPN, dan role aplikasi dasar sesuai departemen.",
    fulfilOutcome: (e: Employee) => [
      " jika penyiapan sudah selesai — dashboard HC otomatis mengubah status ",
      e.name,
      " menjadi Aktif.",
    ] as const,
    fulfilLabels: ["hc-onboarding", "security-provisioning"],
  },
  OFFBOARDING: {
    approvalSummary: (e: Employee) => `[Persetujuan] Penghapusan akun ${e.name} (${e.jobTitle})`,
    approvalHeading: "Butuh persetujuan manager — pencabutan akses",
    approvalIntro: "Human Capital mengajukan pencabutan seluruh akses untuk ",
    approvalOutcome:
      " Setelah disetujui, sistem HC otomatis membuat tiket pencabutan akses untuk IT Security.",
    approvalLabels: ["hc-offboarding", "manager-approval"],
    detailsHeading: "Data karyawan",

    fulfilSummary: (e: Employee) => `[Pencabutan] Cabut akun dan akses ${e.name}`,
    fulfilHeading: "Permintaan pencabutan akun",
    fulfilIntro: "Mohon cabut seluruh akun dan akses karyawan berikut.",
    fulfilChecklist:
      "Nonaktifkan akun direktori, cabut SSO dan VPN, hapus role aplikasi, pindahkan atau arsipkan mailbox, dan tarik kredensial yang pernah diberikan.",
    fulfilOutcome: (e: Employee) => [
      " jika pencabutan sudah selesai — dashboard HC otomatis menandai ",
      e.name,
      " sebagai Dihapus.",
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
  if (request.reason) details.push(["Alasan dari HC", request.reason]);

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
        text(". Mohon periksa detail di bawah lalu setujui atau tolak pengajuan ini."),
      ),
      heading(3, copy.detailsHeading),
      detailList(details),
      rule(),
      heading(3, "Cara merespons"),
      paragraph(
        text("Pindahkan status tiket ini ke "),
        strong(approved),
        text(" untuk menyetujui, atau "),
        strong(rejected),
        text(" untuk menolak."),
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
  details.push(["Tiket persetujuan manager", request.managerIssue?.key ?? "n/a"]);
  if (request.reason) details.push(["Alasan dari HC", request.reason]);

  const issue = await client.createIssue({
    issueType: config.securityIssueType,
    assigneeAccountId: assignee.accountId,
    labels: [...copy.fulfilLabels],
    summary: copy.fulfilSummary(employee),
    description: doc(
      heading(2, copy.fulfilHeading),
      paragraph(
        text("Persetujuan manager sudah selesai"),
        approvedBy ? text(` (disetujui oleh ${approvedBy})`) : text(""),
        text(". "),
        text(copy.fulfilIntro),
      ),
      heading(3, copy.detailsHeading),
      detailList(details),
      heading(3, "Checklist"),
      paragraph(text(copy.fulfilChecklist)),
      rule(),
      paragraph(
        text("Pindahkan status tiket ini ke "),
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
