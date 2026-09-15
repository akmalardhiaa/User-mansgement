import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { getAppBaseUrl } from "@/lib/config/authEnv";
import { prisma } from "@/lib/db/prisma";

/**
 * Sending through an Outlook mailbox with Microsoft Graph.
 *
 * Microsoft retired username/password SMTP for Outlook.com in 2026, so the
 * mailbox is connected once through OAuth (authorization code + PKCE, public
 * client, no secret). The refresh token is kept encrypted in the database and
 * exchanged for short-lived access tokens on demand, so after that one
 * connection nobody has to touch anything: every approval email goes out from
 * the connected mailbox to whatever address the request names.
 *
 * Refresh tokens rotate on use and lapse after 90 days of no use at all. A
 * portal that sends mail regularly therefore stays connected indefinitely.
 */

const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0";
const CONNECTION_ID = "outlook";

export const OUTLOOK_SCOPES = [
  "openid",
  "email",
  "profile",
  "offline_access",
  "https://graph.microsoft.com/User.Read",
  "https://graph.microsoft.com/Mail.Send",
];

export function getOutlookClientId(): string {
  const id = process.env.OUTLOOK_CLIENT_ID?.trim();
  if (!id) {
    throw new Error(
      "OUTLOOK_CLIENT_ID belum diisi. Daftarkan aplikasi di Microsoft Entra, lalu isi Application (client) ID-nya di .env.local.",
    );
  }
  return id;
}

export function outlookRedirectUri(): string {
  return `${getAppBaseUrl()}/api/email/outlook/callback`;
}

/* ------------------------------------------------------ encryption at rest */

function key(): Buffer {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error("JWT_SECRET wajib diisi untuk mengenkripsi token Outlook.");
  // A purpose-bound derivation, so this key is never the one that signs sessions.
  return createHash("sha256").update(`outlook-token:${secret}`).digest();
}

function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64url")).join(".");
}

function unseal(sealed: string): string {
  const [iv, tag, data] = sealed.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/* ------------------------------------------------------------------ PKCE */

export function createPkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  return { verifier, challenge, state };
}

export function outlookAuthorizeUrl(challenge: string, state: string): string {
  const url = new URL(`${AUTHORITY}/authorize`);
  url.search = new URLSearchParams({
    client_id: getOutlookClientId(),
    response_type: "code",
    redirect_uri: outlookRedirectUri(),
    response_mode: "query",
    scope: OUTLOOK_SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

/* ---------------------------------------------------------------- tokens */

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function tokenRequest(params: Record<string, string>) {
  const response = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getOutlookClientId(),
      scope: OUTLOOK_SCOPES.join(" "),
      ...params,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !body.access_token) {
    const detail = body.error_description?.split(/\r?\n/)[0] ?? body.error ?? `HTTP ${response.status}`;
    throw new Error(`Microsoft menolak permintaan token: ${detail}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    // A minute of margin, so a token is never used in its last seconds.
    expiresAt: new Date(Date.now() + Math.max(0, (body.expires_in ?? 3600) - 60) * 1000),
  };
}

/** Finishes the OAuth round trip and stores the connection. Returns the mailbox address. */
export async function completeOutlookConnection(code: string, verifier: string, connectedById: string) {
  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: outlookRedirectUri(),
    code_verifier: verifier,
  });
  if (!tokens.refreshToken) {
    throw new Error("Microsoft tidak memberikan refresh token. Pastikan izin akses offline disetujui.");
  }

  const profile = (await fetch(`${GRAPH}/me?$select=mail,userPrincipalName,displayName`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  }).then((r) => r.json())) as { mail?: string; userPrincipalName?: string; displayName?: string };

  const accountEmail = profile.mail ?? profile.userPrincipalName ?? "akun Microsoft";
  const data = {
    provider: "outlook",
    accountEmail,
    displayName: profile.displayName ?? null,
    refreshToken: seal(tokens.refreshToken),
    accessToken: seal(tokens.accessToken),
    accessTokenExpiresAt: tokens.expiresAt,
    connectedById,
  };
  await prisma.emailConnection.upsert({
    where: { id: CONNECTION_ID },
    create: { id: CONNECTION_ID, ...data },
    update: data,
  });
  return accountEmail;
}

export async function getOutlookConnection() {
  return prisma.emailConnection.findUnique({
    where: { id: CONNECTION_ID },
    select: { accountEmail: true, displayName: true, createdAt: true, updatedAt: true },
  });
}

export async function disconnectOutlook() {
  await prisma.emailConnection.deleteMany({ where: { id: CONNECTION_ID } });
}

// Refresh tokens rotate, so two sends refreshing at once could race each
// other. Within one process, everyone waits for the same refresh.
let refreshing: Promise<string> | null = null;

async function validAccessToken(): Promise<string> {
  const row = await prisma.emailConnection.findUnique({ where: { id: CONNECTION_ID } });
  if (!row) {
    throw new Error('Outlook belum terhubung. Admin perlu menekan "Hubungkan Outlook" di halaman Pengaturan email.');
  }
  if (row.accessToken && row.accessTokenExpiresAt && row.accessTokenExpiresAt.getTime() > Date.now()) {
    return unseal(row.accessToken);
  }

  refreshing ??= (async () => {
    try {
      const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: unseal(row.refreshToken) });
      await prisma.emailConnection.update({
        where: { id: CONNECTION_ID },
        data: {
          accessToken: seal(tokens.accessToken),
          accessTokenExpiresAt: tokens.expiresAt,
          ...(tokens.refreshToken ? { refreshToken: seal(tokens.refreshToken) } : {}),
        },
      });
      return tokens.accessToken;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Sends one message from the connected mailbox. Throws with a readable reason on failure. */
export async function sendWithOutlook(message: { to: string; subject: string; html: string }) {
  const token = await validAccessToken();
  const response = await fetch(`${GRAPH}/me/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: message.subject,
        body: { contentType: "HTML", content: message.html },
        toRecipients: [{ emailAddress: { address: message.to } }],
      },
      saveToSentItems: true,
    }),
  });
  // Graph answers 202 Accepted with an empty body when the message is queued.
  if (response.status !== 202) {
    const body = (await response.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    throw new Error(`Outlook ${response.status}: ${body.error?.message ?? body.error?.code ?? response.statusText}`);
  }
}
