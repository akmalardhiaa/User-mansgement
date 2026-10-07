import { readFile } from "node:fs/promises";
import { isIP } from "node:net";

import { createTransport, type Transporter } from "nodemailer";

import { EmailError, type EmailAcceptance, type EmailDriver, type EmailMessage } from "./types";

/**
 * Sending over SMTP.
 *
 * Two shapes are expected: a mailbox with a login (Gmail with an App Password,
 * Microsoft 365 with SMTP AUTH), and a company relay that accepts mail from
 * this host without one. The relay shape — no login, a certificate from the
 * company CA — has not been tried against a real Exchange server; the status
 * page checks it with a real connection before anybody relies on it.
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
  /** True for implicit TLS on 465; false means STARTTLS is negotiated on 587 or 25. */
  secure: boolean;
  /**
   * Absent for a company relay that accepts mail from this host without a
   * login — the usual shape of an internal Exchange relay on port 25.
   */
  auth?: { user: string; password: string };
  /** The From address. Usually the same as the login. */
  sender: string;
  /**
   * "required": the conversation is encrypted, or nothing is sent. Without it
   * nodemailer upgrades only when the server offers STARTTLS — and a server
   * that stops offering it, or something in between that strips the offer,
   * gets the password in the clear.
   *
   * "off": plain SMTP, for an internal relay with no TLS at all. Refused
   * together with a login, so a password never travels unencrypted.
   */
  tls: "required" | "off";
  /** A CA to trust beyond the public ones, for a relay signed by the company CA. */
  caCertPath?: string;
}

const DEFAULT_PORT = 587;

function trimmed(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function tlsMode(): SmtpConfig["tls"] | undefined {
  const raw = trimmed("SMTP_TLS").toLowerCase();
  if (["", "required", "on", "true"].includes(raw)) return "required";
  if (["off", "none", "false"].includes(raw)) return "off";
  return undefined;
}

export function smtpConfig(): SmtpConfig | undefined {
  if (missingSmtpConfig().length > 0 || smtpConfigProblem()) return undefined;

  const user = trimmed("SMTP_USER");
  const password = process.env.SMTP_PASSWORD ?? "";
  const parsed = Number.parseInt(trimmed("SMTP_PORT"), 10);
  const port = Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;

  return {
    host: trimmed("SMTP_HOST"),
    port,
    secure: port === 465,
    auth: user ? { user, password } : undefined,
    sender: trimmed("SMTP_SENDER") || user,
    tls: tlsMode()!,
    caCertPath: trimmed("SMTP_CA_CERT_PATH") || undefined,
  };
}

/**
 * What is still missing, so the error can say so precisely.
 *
 * The login is optional, but as a pair: one half of it is a typo, not a relay.
 */
export function missingSmtpConfig(): string[] {
  const missing: string[] = [];
  if (!trimmed("SMTP_HOST")) missing.push("SMTP_HOST");
  const user = trimmed("SMTP_USER");
  const password = trimmed("SMTP_PASSWORD");
  if (user && !password) missing.push("SMTP_PASSWORD");
  if (password && !user) missing.push("SMTP_USER");
  if (!trimmed("SMTP_SENDER") && !user) missing.push("SMTP_SENDER");
  return missing;
}

/** A configuration that is complete but contradicts itself. */
export function smtpConfigProblem(): string | undefined {
  const mode = tlsMode();
  if (!mode) {
    return `SMTP_TLS="${trimmed("SMTP_TLS")}" tidak dikenal. Isi required (bawaan) atau off.`;
  }
  if (mode === "off" && trimmed("SMTP_USER")) {
    return "SMTP_TLS=off ditolak bila SMTP_USER/SMTP_PASSWORD diisi: kata sandi tidak boleh lewat koneksi tanpa enkripsi.";
  }
  return undefined;
}

/**
 * What nodemailer is given. Exported so the security-relevant part — TLS is
 * required, certificates are verified, TLS 1.2 at least — is tested rather
 * than trusted.
 */
export function smtpTransportOptions(config: SmtpConfig, ca?: Buffer) {
  return {
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.tls === "required" && !config.secure,
    ignoreTLS: config.tls === "off",
    auth: config.auth ? { user: config.auth.user, pass: config.auth.password } : undefined,
    tls: {
      rejectUnauthorized: true,
      minVersion: "TLSv1.2" as const,
      // SNI carries a name, never an address (RFC 6066).
      ...(isIP(config.host) ? {} : { servername: config.host }),
      ...(ca ? { ca } : {}),
    },
    // nodemailer waits two minutes for a connection by default; a relay that
    // is not answering should be retried by the outbox, not waited on.
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  };
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
  private async transporter(): Promise<Transporter> {
    if (this.transport) return this.transport;
    let ca: Buffer | undefined;
    if (this.config.caCertPath) {
      try {
        ca = await readFile(this.config.caCertPath);
      } catch (error) {
        // Not retried: a file that is not there will not appear by trying again.
        throw new EmailError(
          "UNKNOWN",
          `Sertifikat CA di SMTP_CA_CERT_PATH="${this.config.caCertPath}" tidak bisa dibaca: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    this.transport = createTransport(smtpTransportOptions(this.config, ca));
    return this.transport;
  }

  /**
   * Connects, negotiates TLS and logs in, without sending anything — for the
   * status page, so a wrong password shows up there rather than on the first
   * approval email nobody received.
   */
  async verify(): Promise<void> {
    const transport = await this.transporter();
    try {
      await transport.verify();
    } catch (error) {
      throw classifySmtpError(error);
    }
  }

  async send(message: EmailMessage): Promise<EmailAcceptance> {
    let info: { messageId?: string };
    const transport = await this.transporter();

    try {
      /*
       * The Adaptive Card is dropped, as it is for Gmail. Actionable Messages
       * are an Outlook feature carried outside the message body; over SMTP the
       * HTML is all there is, which is exactly why the body has to carry the
       * whole request on its own (see types.ts).
       */
      info = await transport.sendMail({
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
