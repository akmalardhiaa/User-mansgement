import type { EmailAcceptance, EmailAddress, EmailDriver, EmailMessage } from "./types";

/**
 * Sending every message to one mailbox instead of the person it was addressed to.
 *
 * A demo directory is full of addresses that belong to somebody. Each approval
 * email carries a single-use token, and the page that consumes it is public by
 * necessity — Outlook posts the decision with no session behind it. So a message
 * delivered to the wrong person is not a cosmetic mistake: it hands a stranger
 * the power to approve a termination.
 *
 * Redirecting is preferred to correcting the directory because it stays correct
 * when the data changes. Rewriting addresses fixes the ones present today; this
 * still holds when somebody seeds a new employee tomorrow.
 *
 * Refused in production for the reason the file driver is refused there:
 * approvers who are never told, while the dashboard reports the message as
 * accepted, is the failure this whole layer exists to prevent.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The configured address, or undefined when no redirect is asked for. */
export function redirectTarget(): string | undefined {
  return process.env.EMAIL_REDIRECT_TO?.trim() || undefined;
}

export function isValidRedirect(address: string): boolean {
  return EMAIL_PATTERN.test(address);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Says who the message was really for.
 *
 * Without this the inbox becomes a pile of approvals with no way to tell which
 * approver each one was asking — and somebody answers the wrong one.
 */
function notice(intended: EmailAddress): string {
  const who = escapeHtml(intended.name ? `${intended.name} <${intended.address}>` : intended.address);
  return (
    `<div style="margin:0 0 16px;padding:12px 14px;border:1px solid #f0c36d;` +
    `background:#fdf6e3;border-radius:6px;font:14px/1.5 system-ui,sans-serif;color:#6b4e00">` +
    `<strong>Email ini dialihkan.</strong> Tujuan aslinya: <code>${who}</code>.<br>` +
    `Pengalihan aktif karena <code>EMAIL_REDIRECT_TO</code> diset, supaya token persetujuan ` +
    `tidak sampai ke orang lain.` +
    `</div>`
  );
}

export class RedirectingEmailDriver implements EmailDriver {
  readonly name: string;
  readonly simulated: boolean;

  constructor(
    private readonly inner: EmailDriver,
    private readonly target: string,
  ) {
    // Named so an operator reading a log or a status line sees the redirect
    // rather than believing mail went where it was addressed.
    this.name = `${inner.name}+redirect`;
    /*
     * Not upgraded to "simulated". Redirected Graph mail is genuinely sent —
     * it really leaves the tenant and really lands in an inbox. Calling that
     * simulated would understate what just happened.
     */
    this.simulated = inner.simulated;
  }

  async send(message: EmailMessage): Promise<EmailAcceptance> {
    const intended = message.to;

    return this.inner.send({
      ...message,
      to: { address: this.target },
      // Prefixed so one inbox holding every approver's mail stays scannable.
      subject: `[→ ${intended.address}] ${message.subject}`,
      html: `${notice(intended)}${message.html}`,
    });
  }
}
