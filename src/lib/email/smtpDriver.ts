import { createTransport, type Transporter } from "nodemailer";

import { EmailError, type EmailAcceptance, type EmailDriver, type EmailMessage } from "./types";

/**
 * Sending over SMTP.
 *
 * NOT VERIFIED AGAINST A REAL SERVER. Written from the protocol's documented
 * behaviour; `EMAIL_DRIVER=smtp` fails on missing configuration rather than on
 * missing code.
 *
 * This is the one driver that takes a dependency, and the reason is not
 * convenience. Graph and Gmail are each a single HTTPS POST, so a client library
 * plus its transitive tree buys nothing. SMTP is a stateful conversation over
 * TLS — greeting, capability negotiation, STARTTLS upgrade, authentication,
 * envelope, then a body with its own dot-stuffing and line-ending rules. Hand
 * rolling that enlarges the surface for mistakes rather than shrinking it.
 *
 * For Gmail specifically the password here is an App Password, which requires
 * 2-Step Verification on the account. Ordinary account passwords have not been
 * accepted since "less secure app access" was withdrawn.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  /** True for implicit TLS on 465; false means STARTTLS is negotiated on 587. */
  secure: boolean;
  user: string;
  password: string;
  /** The From address. Usually the same as `user`. */
  sender: string;
}

const DEFAULT_PORT = 587;

export function smtpConfig(): SmtpConfig | undefined {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.trim();
  const sender = process.env.SMTP_SENDER?.trim() || user;

  if (!host || !user || !password || !sender) return undefined;

  const parsed = Number.parseInt(process.env.SMTP_PORT?.trim() ?? "", 10);
  const port = Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;

  return { host, port, secure: port === 465, user, password, sender };
}

/** What is still missing, so the error can say so precisely. */
export function missingSmtpConfig(): string[] {
  return (
    [
      ["SMTP_HOST", process.env.SMTP_HOST],
      ["SMTP_USER", process.env.SMTP_USER],
      ["SMTP_PASSWORD", process.env.SMTP_PASSWORD],
    ] as const
  )
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);
}

interface SmtpFailure {
  code?: string;
  responseCode?: number;
  message?: string;
}

/**
 * Turns an SMTP failure into a decision about whether to try again.
 *
 * The distinction that matters is 4xx against 5xx. SMTP says a 4xx is temporary
 * — the mailbox is busy, the server is throttling — and a 5xx is permanent.
 * Retrying a permanent rejection produces the identical rejection five more
 * times and buries the one message an operator needed to read.
 *
 * Exported so the mapping can be tested without an SMTP server, which is the
 * part worth testing: the transport itself is nodemailer's problem.
 */
export function classifySmtpError(error: unknown): EmailError {
  const failure = (error ?? {}) as SmtpFailure;
  const message = failure.message ?? String(error);
  const status = failure.responseCode;

  // Authentication is configuration, never a transient blip. For Gmail this is
  // almost always an App Password that was never created, or 2-Step
  // Verification that is not switched on.
  if (failure.code === "EAUTH" || status === 535) {
    return new EmailError("PERMISSION", `SMTP menolak autentikasi: ${message}`);
  }

  // Could not reach the server at all, or it hung up mid-conversation.
  if (
    failure.code === "ECONNECTION" ||
    failure.code === "ETIMEDOUT" ||
    failure.code === "ESOCKET" ||
    failure.code === "ECONNRESET"
  ) {
    return new EmailError("TRANSIENT", `SMTP tidak dapat dihubungi: ${message}`);
  }

  if (status !== undefined) {
    if (status >= 400 && status < 500) {
      return new EmailError("TRANSIENT", `SMTP menunda pesan (${status}): ${message}`);
    }
    if (status === 550 || status === 551 || status === 553) {
      return new EmailError("RECIPIENT_REJECTED", `Alamat penerima ditolak (${status}).`);
    }
    if (status >= 500) {
      return new EmailError("PAYLOAD", `SMTP menolak pesan (${status}): ${message}`);
    }
  }

  return new EmailError("UNKNOWN", `Pengiriman SMTP gagal: ${message}`);
}

export class SmtpEmailDriver implements EmailDriver {
  readonly name = "smtp";
  readonly simulated = false;

  private transport?: Transporter;

  constructor(private config: SmtpConfig) {}

  /** Built once and reused, so the TLS handshake is not repeated per message. */
  private transporter(): Transporter {
    this.transport ??= createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: { user: this.config.user, pass: this.config.password },
    });
    return this.transport;
  }

  async send(message: EmailMessage): Promise<EmailAcceptance> {
    let info: { messageId?: string };

    try {
      /*
       * The Adaptive Card is dropped, as it is for Gmail. Actionable Messages
       * are an Outlook feature carried outside the message body; over SMTP the
       * HTML is all there is, which is exactly why the body has to carry the
       * whole request on its own (see types.ts).
       */
      info = await this.transporter().sendMail({
        from: this.config.sender,
        to: message.to.name
          ? { name: message.to.name, address: message.to.address }
          : message.to.address,
        subject: message.subject,
        html: message.html,
      });
    } catch (error) {
      throw classifySmtpError(error);
    }

    /*
     * The server took the message. That is the same promise Graph's 202 makes
     * and no more: a relay accepting a message can still bounce it minutes
     * later, and nothing here ever learns whether it arrived.
     */
    return {
      accepted: true,
      providerRef: info.messageId ? `smtp:${info.messageId}` : `smtp:${Date.now()}`,
      acceptedAt: new Date().toISOString(),
    };
  }
}
