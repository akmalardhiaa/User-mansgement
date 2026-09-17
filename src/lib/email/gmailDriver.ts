import { EmailError, type EmailAcceptance, type EmailDriver, type EmailMessage } from "./types";

/**
 * Sending through the Gmail API.
 *
 * NOT VERIFIED AGAINST A REAL ACCOUNT. Written from the documented API; it has
 * never sent a message, and `EMAIL_DRIVER=gmail` fails on missing configuration
 * rather than on missing code.
 *
 * Native fetch rather than googleapis, for the reason the Graph driver gives:
 * two endpoints are being called, and a client library plus its transitive tree
 * is not worth that.
 *
 * An OAuth refresh token rather than a service account. Domain-wide delegation
 * exists only for Google Workspace, so a personal Gmail account cannot use it.
 * The scope asked for is `gmail.send` alone — this cannot read the mailbox it
 * sends from, which is the whole of what a notification sender needs.
 *
 * The one thing this faces that the Graph driver does not: Graph takes JSON,
 * while Gmail takes a raw RFC 2822 message. Building headers by hand means
 * header injection is a real risk here, and the subject carries data — the
 * redirect writes the intended recipient into it. See `assertHeaderSafe`.
 */

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** The address messages are sent from; must be the authorised account. */
  sender: string;
}

export function gmailConfig(): GmailConfig | undefined {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();
  const sender = process.env.GMAIL_SENDER?.trim();

  if (!clientId || !clientSecret || !refreshToken || !sender) return undefined;
  return { clientId, clientSecret, refreshToken, sender };
}

/** What is still missing, so the error can say so precisely. */
export function missingGmailConfig(): string[] {
  return (
    [
      ["GMAIL_CLIENT_ID", process.env.GMAIL_CLIENT_ID],
      ["GMAIL_CLIENT_SECRET", process.env.GMAIL_CLIENT_SECRET],
      ["GMAIL_REFRESH_TOKEN", process.env.GMAIL_REFRESH_TOKEN],
      ["GMAIL_SENDER", process.env.GMAIL_SENDER],
    ] as const
  )
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);
}

/**
 * Refuses a header value that could end the header and start another.
 *
 * A subject or address carrying CR or LF would let whatever follows be read as
 * further headers — a Bcc, a different From. This is not hypothetical here: the
 * redirect writes the intended recipient's address into the subject, and that
 * address comes from directory data.
 */
function assertHeaderSafe(value: string, field: string): void {
  if (/[\r\n]/.test(value)) {
    throw new EmailError("PAYLOAD", `${field} memuat baris baru; header tidak dapat disusun.`);
  }
}

/**
 * RFC 2047 encoding, applied only when it is needed.
 *
 * Header values are ASCII. Our subjects are not — they carry an em dash, and
 * the redirect adds an arrow — so anything outside printable ASCII is sent as
 * an encoded word rather than as raw bytes a receiver may mangle.
 */
export function encodeHeaderValue(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Base64 body, wrapped at 76 characters as RFC 2045 requires. */
function wrapBase64(value: string): string {
  return (value.match(/.{1,76}/g) ?? []).join("\r\n");
}

/**
 * The complete message, base64url encoded, as Gmail's `raw` field wants it.
 *
 * Exported so the header construction can be tested without a network call —
 * the part worth testing is what the headers say, not that fetch works.
 */
export function buildRawMessage(message: EmailMessage, sender: string): string {
  assertHeaderSafe(sender, "Alamat pengirim");
  assertHeaderSafe(message.to.address, "Alamat penerima");
  assertHeaderSafe(message.subject, "Subjek");
  if (message.to.name) assertHeaderSafe(message.to.name, "Nama penerima");

  const recipient = message.to.name
    ? `${encodeHeaderValue(message.to.name)} <${message.to.address}>`
    : message.to.address;

  const headers = [
    `From: ${sender}`,
    `To: ${recipient}`,
    `Subject: ${encodeHeaderValue(message.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];

  /*
   * The Adaptive Card is deliberately dropped. Actionable Messages are an
   * Outlook feature; Gmail renders the HTML body, which is exactly why the
   * body has to carry the whole request on its own (see types.ts).
   */
  const body = wrapBase64(Buffer.from(message.html, "utf8").toString("base64"));

  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`, "utf8").toString("base64url");
}

const TIMEOUT_MS = 15_000;

async function withTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class GmailEmailDriver implements EmailDriver {
  readonly name = "gmail";
  readonly simulated = false;

  private token?: { value: string; expiresAt: number };

  constructor(private config: GmailConfig) {}

  /** Refresh-token grant, cached until shortly before it expires. */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;

    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: this.config.refreshToken,
      grant_type: "refresh_token",
    });

    let response: Response;
    try {
      response = await withTimeout("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch {
      throw new EmailError("TRANSIENT", "Tidak dapat menghubungi endpoint token Google.");
    }

    if (!response.ok) {
      /*
       * A refresh token is rejected for reasons retrying cannot fix: revoked in
       * the account's security settings, expired after six months unused, or
       * invalidated because the OAuth app is still in "Testing" — Google expires
       * those in seven days.
       */
      throw new EmailError("PERMISSION", `Gagal memperoleh token Gmail (HTTP ${response.status}).`);
    }

    const payload = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!payload.access_token) {
      throw new EmailError("PERMISSION", "Respons token Google tidak memuat access_token.");
    }

    this.token = {
      value: payload.access_token,
      expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    };
    return this.token.value;
  }

  async send(message: EmailMessage): Promise<EmailAcceptance> {
    const raw = buildRawMessage(message, this.config.sender);
    const token = await this.accessToken();

    let response: Response;
    try {
      response = await withTimeout(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ raw }),
        },
      );
    } catch {
      throw new EmailError("TRANSIENT", "Tidak dapat menghubungi Gmail API.");
    }

    if (response.status === 429) {
      const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
      throw new EmailError(
        "RATE_LIMITED",
        "Gmail membatasi laju pengiriman.",
        Number.isFinite(retryAfter) ? retryAfter : undefined,
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new EmailError("PERMISSION", `Gmail menolak pengiriman (HTTP ${response.status}).`);
    }
    if (response.status >= 500) {
      throw new EmailError("TRANSIENT", `Gmail sedang bermasalah (HTTP ${response.status}).`);
    }
    if (!response.ok) {
      throw new EmailError("PAYLOAD", `Gmail menolak pesan (HTTP ${response.status}).`);
    }

    /*
     * 200 with the queued message's id. Gmail has taken the message; whether it
     * reaches the recipient's inbox, their spam folder, or bounces later is not
     * something this ever learns. `accepted` says the first, and nothing here
     * upgrades it to the second.
     */
    const payload = (await response.json()) as { id?: string };
    return {
      accepted: true,
      providerRef: payload.id ? `gmail:${payload.id}` : `gmail:${Date.now()}`,
      acceptedAt: new Date().toISOString(),
    };
  }
}
