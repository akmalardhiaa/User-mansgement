import { getTestMode } from "@/lib/config/approvalEnv";
import { getAppBaseUrl, getEmailConfig, type EmailConfig } from "@/lib/config/authEnv";

import type { AccessRequest, Employee } from "@/lib/types";

import { managerApprovalEmail } from "./approvalTemplate";
import { sendWithOutlook } from "./outlook";
import { securityProvisioningEmail } from "./securityTemplate";
import { passwordResetEmail, verificationEmail, type RenderedEmail } from "./templates";

/**
 * Outbound mail.
 *
 * Both transports the spec allows are supported and picked with EMAIL_SERVICE,
 * so switching from a Gmail app password in development to SendGrid in
 * production is a config change rather than a code change. Each provider SDK
 * is imported dynamically: a static import would bundle both into every route
 * that sends mail, and would fail at module load for whichever one is not
 * installed.
 */

export interface SendResult {
  delivered: boolean;
  /** Set when delivery failed, for logging — never surfaced to the caller. */
  error?: string;
}

interface Message extends RenderedEmail {
  to: string;
}

async function sendWithNodemailer(config: EmailConfig, message: Message): Promise<void> {
  const nodemailer = (await import("nodemailer")).default;

  const transport =
    config.transport === "gmail"
      ? nodemailer.createTransport({
          service: "gmail",
          auth: { user: config.user!, pass: config.password! },
        })
      : nodemailer.createTransport({
          host: config.host!,
          port: config.port ?? 587,
          // 465 is implicit TLS; everything else starts plaintext and upgrades
          // with STARTTLS, which nodemailer does automatically.
          secure: (config.port ?? 587) === 465,
          auth: config.user ? { user: config.user, pass: config.password! } : undefined,
        });

  await transport.sendMail({
    from: config.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

async function sendWithSendGrid(config: EmailConfig, message: Message): Promise<void> {
  const sendgrid = (await import("@sendgrid/mail")).default;
  sendgrid.setApiKey(config.apiKey!);
  await sendgrid.send({
    from: config.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

/**
 * Resend over its HTTP API. No SDK: one fetch is the whole integration, and it
 * goes out on port 443, which networks that block SMTP ports still allow.
 */
async function sendWithResend(config: EmailConfig, message: Message): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: config.from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string; name?: string };
    throw new Error(`Resend ${response.status}: ${body.message ?? body.name ?? response.statusText}`);
  }
}

function logToConsole(message: Message): void {
  // Development fallback. Printing the whole body would bury the one thing
  // anyone needs from it, so this prints the actionable links only — found
  // anywhere in a line, because buttons render as "SETUJUI: https://…" and a
  // test-mode note can precede the body.
  const links = message.text.match(/https?:\/\/\S+/g) ?? [];
  console.info(
    `\n[email] EMAIL_SERVICE is unset — not sending.\n` +
      `        to:      ${message.to}\n` +
      `        subject: ${message.subject}\n` +
      (links.length > 0
        ? links.map((url) => `        link:    ${url}\n`).join("")
        : `        link:    (none)\n`),
  );
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Applies TEST_MODE: the message goes to TEST_RECIPIENT, and says so.
 *
 * The intended recipient is written into the subject and into a banner at the
 * top of both bodies. A redirected approval request that looks identical to a
 * real one is how a tester ends up approving something in earnest.
 */
function applyTestMode(message: Message): Message {
  const test = getTestMode();
  if (!test.enabled || !test.recipient) return message;

  const note = `MODE TES — email ini seharusnya dikirim ke ${message.to}`;
  const banner =
    `<div style="background:#fef3c7;border-bottom:1px solid #f59e0b;color:#78350f;` +
    `font-family:Arial,sans-serif;font-size:13px;padding:10px 16px;text-align:center;">` +
    `${escapeHtml(note)}</div>`;

  return {
    ...message,
    to: test.recipient,
    subject: `[TES → ${message.to}] ${message.subject}`,
    html: /<body[^>]*>/i.test(message.html)
      ? message.html.replace(/<body[^>]*>/i, (tag) => `${tag}${banner}`)
      : `${banner}${message.html}`,
    text: `${note}\n\n${message.text}`,
  };
}

/**
 * Sends a message, converting a delivery failure into a result rather than an
 * exception. Callers decide what a failed send means for their flow; none of
 * them should return a 500 just because a mail server was briefly unreachable.
 */
export async function sendEmail(original: Message): Promise<SendResult> {
  const message = applyTestMode(original);
  try {
    const config = getEmailConfig();

    if (config.transport === "console") {
      logToConsole(message);
      return { delivered: true };
    }

    if (config.transport === "outlook") await sendWithOutlook(message);
    else if (config.transport === "resend") await sendWithResend(config, message);
    else if (config.transport === "sendgrid") await sendWithSendGrid(config, message);
    else await sendWithNodemailer(config, message);

    return { delivered: true };
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    console.error(`[email] delivery to ${message.to} failed: ${error}`);
    return { delivered: false, error };
  }
}

function link(path: string, token: string): string {
  return `${getAppBaseUrl()}${path}?token=${encodeURIComponent(token)}`;
}

export async function sendVerificationEmail(
  user: { email: string; fullName: string },
  token: string,
): Promise<SendResult> {
  return sendEmail({
    to: user.email,
    ...verificationEmail(user.fullName, link("/verify-email", token), token),
  });
}

export async function sendPasswordResetEmail(
  user: { email: string; fullName: string },
  token: string,
): Promise<SendResult> {
  return sendEmail({
    to: user.email,
    ...passwordResetEmail(user.fullName, link("/reset-password", token), token),
  });
}

/**
 * Asks a manager to approve an access request.
 *
 * The URL is a path segment rather than a query string so the token is not
 * dropped into a `Referer` header when the decision page loads anything
 * external, and so it reads as a page rather than a one-click action.
 */
export async function sendManagerApprovalEmail(
  employee: Employee,
  request: AccessRequest,
  token: string,
  expiresAt: Date,
): Promise<SendResult> {
  const url = `${getAppBaseUrl()}/approvals/${encodeURIComponent(token)}`;
  return sendEmail({
    to: employee.managerEmail,
    ...managerApprovalEmail(employee, request, url, expiresAt),
  });
}

/**
 * Hands a provisioning job to the security team.
 *
 * Same URL shape as the manager approval, and for the same reason: a path
 * segment keeps the token out of `Referer` headers and makes the link read as
 * a page rather than a one-click action.
 */
export async function sendSecurityProvisioningEmail(
  employee: Employee,
  request: AccessRequest,
  token: string,
  expiresAt: Date,
  team: { name: string; email: string },
  approvedBy?: string,
): Promise<SendResult> {
  const url = `${getAppBaseUrl()}/approvals/${encodeURIComponent(token)}`;
  return sendEmail({
    to: team.email,
    ...securityProvisioningEmail(employee, request, url, expiresAt, team.name, approvedBy),
  });
}
