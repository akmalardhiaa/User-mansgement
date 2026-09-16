import { EmailError, type EmailAcceptance, type EmailDriver, type EmailMessage } from "./types";

/**
 * Sending through Microsoft Graph.
 *
 * NOT VERIFIED AGAINST A REAL TENANT. It is written from the documented API and
 * has never sent a message: there is no Entra registration, no consented
 * permission, and no sender mailbox behind it yet. It exists so the shape of the
 * work is visible and so `EMAIL_DRIVER=graph` fails on missing configuration
 * rather than on missing code.
 *
 * Two things it is careful about even unverified:
 *
 *   - `sendMail` answers 202 Accepted. That is queued, not delivered, and the
 *     acceptance returned here says exactly that much.
 *   - Application permissions for Mail.Send are tenant-wide unless narrowed.
 *     The plan requires Exchange Online RBAC for Applications scoping the app
 *     to the one sender mailbox; nothing in this file can enforce that, which is
 *     why it is called out here and in the configuration notes.
 *
 * Native fetch with a timeout rather than the Graph SDK: one endpoint is being
 * called, and a dependency plus its transitive tree is not worth a single POST.
 */

export interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** The mailbox messages are sent from. */
  sender: string;
}

export function graphConfig(): GraphConfig | undefined {
  const tenantId = process.env.GRAPH_TENANT_ID?.trim();
  const clientId = process.env.GRAPH_CLIENT_ID?.trim();
  const clientSecret = process.env.GRAPH_CLIENT_SECRET?.trim();
  const sender = process.env.GRAPH_SENDER_MAILBOX?.trim();

  if (!tenantId || !clientId || !clientSecret || !sender) return undefined;
  return { tenantId, clientId, clientSecret, sender };
}

/** What is still missing, so the error can say so precisely. */
export function missingGraphConfig(): string[] {
  return (
    [
      ["GRAPH_TENANT_ID", process.env.GRAPH_TENANT_ID],
      ["GRAPH_CLIENT_ID", process.env.GRAPH_CLIENT_ID],
      ["GRAPH_CLIENT_SECRET", process.env.GRAPH_CLIENT_SECRET],
      ["GRAPH_SENDER_MAILBOX", process.env.GRAPH_SENDER_MAILBOX],
    ] as const
  )
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);
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

export class GraphEmailDriver implements EmailDriver {
  readonly name = "graph";
  readonly simulated = false;

  private token?: { value: string; expiresAt: number };

  constructor(private config: GraphConfig) {}

  /** Client-credentials token, cached until shortly before it expires. */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;

    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });

    let response: Response;
    try {
      response = await withTimeout(
        `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`,
        { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
      );
    } catch {
      throw new EmailError("TRANSIENT", "Tidak dapat menghubungi endpoint token Microsoft.");
    }

    if (!response.ok) {
      // A rejected client credential is a configuration problem, and retrying
      // it produces the same rejection every time.
      throw new EmailError("PERMISSION", `Gagal memperoleh token Graph (HTTP ${response.status}).`);
    }

    const payload = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!payload.access_token) {
      throw new EmailError("PERMISSION", "Respons token Microsoft tidak memuat access_token.");
    }

    this.token = {
      value: payload.access_token,
      expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    };
    return this.token.value;
  }

  async send(message: EmailMessage): Promise<EmailAcceptance> {
    const token = await this.accessToken();

    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.config.sender)}/sendMail`;

    let response: Response;
    try {
      response = await withTimeout(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: message.subject,
            body: { contentType: "HTML", content: message.html },
            toRecipients: [
              { emailAddress: { address: message.to.address, name: message.to.name } },
            ],
          },
          saveToSentItems: true,
        }),
      });
    } catch {
      throw new EmailError("TRANSIENT", "Tidak dapat menghubungi Microsoft Graph.");
    }

    if (response.status === 429) {
      const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
      throw new EmailError(
        "RATE_LIMITED",
        "Graph membatasi laju pengiriman.",
        Number.isFinite(retryAfter) ? retryAfter : undefined,
      );
    }
    if (response.status === 403 || response.status === 401) {
      throw new EmailError("PERMISSION", `Graph menolak pengiriman (HTTP ${response.status}).`);
    }
    if (response.status >= 500) {
      throw new EmailError("TRANSIENT", `Graph sedang bermasalah (HTTP ${response.status}).`);
    }
    if (!response.ok) {
      throw new EmailError("PAYLOAD", `Graph menolak pesan (HTTP ${response.status}).`);
    }

    /*
     * 202 Accepted. Queued for processing — not delivered, and nothing here
     * will ever learn whether it arrived. The reference is Graph's request id,
     * which is what an administrator traces a missing message by.
     */
    return {
      accepted: true,
      providerRef: response.headers.get("request-id") ?? `graph:${Date.now()}`,
      acceptedAt: new Date().toISOString(),
    };
  }
}
