import { notFound } from "next/navigation";

import { managerApprovalEmail } from "@/lib/email/approvalTemplate";
import { securityProvisioningEmail } from "@/lib/email/securityTemplate";
import { passwordResetEmail, verificationEmail } from "@/lib/email/templates";
import {
  accountActiveEmail,
  cisoApprovalRequestEmail,
  managerApprovalRequestEmail,
  rejectionEmail,
} from "@/lib/email/emailTemplates";
import type { AccessRequest, Employee, RequestType } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/dev/email-preview — renders an email template in the browser.
 *
 * Development only. Email templates are the one thing in this app that cannot
 * be checked by looking at the app: they render inside someone else's mail
 * client, and the only way to know a change did not break Outlook is to look at
 * the markup that gets sent. This serves exactly what the mailer would send.
 *
 * The sample data is deliberately fictional. A preview endpoint that rendered
 * real employees would be a way to read the directory without signing in.
 */

const SAMPLE_EMPLOYEE: Employee = {
  id: "emp_preview",
  firstName: "Nadia",
  lastName: "Kusuma",
  displayName: "Nadia Kusuma",
  email: "nadia.kusuma@example.com",
  jobTitle: "Equity Research Analyst",
  jobDescription: "Menyusun riset ekuitas sektor consumer goods dan mendampingi tim sales.",
  department: "Research",
  employmentType: "PERMANENT",
  locationType: "PUSAT",
  managerName: "Akmal Ardhia",
  managerEmail: "manager@example.com",
  status: "PENDING_MANAGER_APPROVAL",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function sampleRequest(type: RequestType): AccessRequest {
  return {
    id: "req_preview",
    employeeId: SAMPLE_EMPLOYEE.id,
    type,
    stage: "MANAGER_APPROVAL",
    reason: type === "ONBOARDING" ? undefined : "Rotasi tahunan divisi Research.",
    transfer:
      type === "TRANSFER"
        ? {
            department: "Investment Banking",
            jobTitle: "Associate",
            managerName: "Dimas Prakoso",
            managerEmail: "dimas@example.com",
          }
        : undefined,
    events: [],
    processedSignals: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  // Guarded rather than deleted: the preview is useful in development and has
  // no business existing in a deployed app.
  if (process.env.NODE_ENV === "production") notFound();

  const url = new URL(request.url);
  const template = url.searchParams.get("template") ?? "manager";
  const type = (url.searchParams.get("type") ?? "ONBOARDING") as RequestType;

  const expires = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const link = `${url.origin}/approvals/PREVIEW-TOKEN-NOT-REAL`;

  const rendered = (() => {
    switch (template) {
      case "security":
        return securityProvisioningEmail(
          SAMPLE_EMPLOYEE,
          sampleRequest(type),
          link,
          expires,
          "Tim CISO Cyber Security",
          "Akmal Ardhia (manager)",
        );
      case "verification":
        return verificationEmail(SAMPLE_EMPLOYEE.displayName, link, "preview-token");
      // The account approval workflow (register-with-approval).
      case "approval-manager":
        return managerApprovalRequestEmail({
          employeeName: "Nadia Kusuma", email: "nadia.kusuma@example.com", department: "Research",
          notes: "Mulai kerja 1 Oktober, tim riset consumer goods.", managerName: "Dimas Prakoso",
          requesterName: "akmalardhia", expiresIn: "24 jam",
          approveUrl: `${url.origin}/approval?token=PREVIEW&action=approve`,
          rejectUrl: `${url.origin}/approval?token=PREVIEW&action=reject`,
        });
      case "approval-ciso":
        return cisoApprovalRequestEmail({
          employeeName: "Nadia Kusuma", email: "nadia.kusuma@example.com", department: "Research",
          cisoName: "Tim CISO Cyber Security", managerName: "Dimas Prakoso",
          managerApprovedAt: new Date(), expiresIn: "24 jam",
          approveUrl: `${url.origin}/approval?token=PREVIEW&action=approve`,
          rejectUrl: `${url.origin}/approval?token=PREVIEW&action=reject`,
        });
      case "approval-active":
        return accountActiveEmail({
          employeeName: "Nadia Kusuma", email: "nadia.kusuma@example.com", department: "Research",
          loginUrl: `${url.origin}/login`,
        });
      case "approval-rejected":
        return rejectionEmail({
          employeeName: "Nadia Kusuma", email: "nadia.kusuma@example.com", department: "Research",
          requesterName: "akmalardhia", rejectedByName: "Tim CISO Cyber Security",
          rejectedByRole: "CISO / IT Security", reason: "Belum ada surat penugasan dari divisi.",
          rejectedAt: new Date(),
        });
      case "reset":
        return passwordResetEmail(SAMPLE_EMPLOYEE.displayName, link, "preview-token");
      default:
        return managerApprovalEmail(SAMPLE_EMPLOYEE, sampleRequest(type), link, expires);
    }
  })();

  // `?format=text` shows the plain-text alternative, which is what a client
  // that refuses HTML actually displays — and the part that silently rots.
  if (url.searchParams.get("format") === "text") {
    return new Response(`Subject: ${rendered.subject}\n\n${rendered.text}`, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(rendered.html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
