import { describeTtl, getApprovalTokenTtlMs } from "@/lib/config/approvalEnv";
import { getAppBaseUrl } from "@/lib/config/authEnv";
import { sendEmail, type SendResult } from "@/lib/email";
import {
  accountActiveEmail,
  cisoApprovalRequestEmail,
  managerApprovalRequestEmail,
  rejectionEmail,
} from "@/lib/email/emailTemplates";

/**
 * Sends the four workflow emails. Knows addresses and links; the wording lives
 * in emailTemplates.ts.
 */

export interface MailableRequest {
  department: string;
  notes: string | null;
  managerName: string;
  managerEmail: string;
  managerApprovedAt: Date | null;
  cisoName: string;
  cisoEmail: string;
  requesterName: string;
  requesterEmail: string;
  user: { fullName: string; email: string };
}

/** Both buttons open the decision page; the action only preselects a choice there. */
function decisionUrls(rawToken: string) {
  const base = `${getAppBaseUrl()}/approval?token=${encodeURIComponent(rawToken)}`;
  return { approveUrl: `${base}&action=approve`, rejectUrl: `${base}&action=reject` };
}

export function sendManagerRequest(request: MailableRequest, rawToken: string): Promise<SendResult> {
  return sendEmail({
    to: request.managerEmail,
    ...managerApprovalRequestEmail({
      employeeName: request.user.fullName,
      email: request.user.email,
      department: request.department,
      notes: request.notes,
      managerName: request.managerName,
      requesterName: request.requesterName,
      expiresIn: describeTtl(getApprovalTokenTtlMs()),
      ...decisionUrls(rawToken),
    }),
  });
}

export function sendCisoRequest(request: MailableRequest, rawToken: string): Promise<SendResult> {
  return sendEmail({
    to: request.cisoEmail,
    ...cisoApprovalRequestEmail({
      employeeName: request.user.fullName,
      email: request.user.email,
      department: request.department,
      cisoName: request.cisoName,
      managerName: request.managerName,
      managerApprovedAt: request.managerApprovedAt ?? new Date(),
      expiresIn: describeTtl(getApprovalTokenTtlMs()),
      ...decisionUrls(rawToken),
    }),
  });
}

export function sendAccountActive(request: MailableRequest): Promise<SendResult> {
  return sendEmail({
    to: request.user.email,
    ...accountActiveEmail({
      employeeName: request.user.fullName,
      email: request.user.email,
      department: request.department,
      loginUrl: `${getAppBaseUrl()}/login`,
    }),
  });
}

export function sendRejection(
  request: MailableRequest,
  rejection: { byName: string; byRole: string; reason: string; at: Date },
): Promise<SendResult> {
  return sendEmail({
    to: request.requesterEmail,
    ...rejectionEmail({
      employeeName: request.user.fullName,
      email: request.user.email,
      department: request.department,
      requesterName: request.requesterName,
      rejectedByName: rejection.byName,
      rejectedByRole: rejection.byRole,
      reason: rejection.reason,
      rejectedAt: rejection.at,
    }),
  });
}
