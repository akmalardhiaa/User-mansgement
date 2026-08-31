/**
 * Signed session cookies.
 *
 * Built on Web Crypto rather than `node:crypto` so the same code verifies a
 * session in middleware (Edge runtime) and in route handlers (Node runtime).
 *
 * The cookie carries the signed identity, not a session id — there is no
 * server-side session store to keep in sync. That means a session cannot be
 * revoked before it expires; rotating `AUTH_SECRET` invalidates all of them.
 */

export const SESSION_COOKIE = "hc_session";

/** Eight hours: long enough for a working day, short enough to expire overnight. */
const SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface SessionPayload {
  email: string;
  name: string;
  /** Expiry, seconds since epoch. */
  exp: number;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  // Backed by a plain ArrayBuffer so it satisfies BufferSource for Web Crypto.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short (16+ characters). Sessions cannot be signed. See .env.example.",
    );
  }
  return secret;
}

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Returns the cookie value for a freshly issued session. */
export async function createSessionToken(user: { email: string; name: string }): Promise<string> {
  const payload: SessionPayload = {
    email: user.email,
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const body = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await importKey(), new TextEncoder().encode(body));
  return `${body}.${encodeBase64Url(new Uint8Array(signature))}`;
}

/**
 * Verifies the signature and expiry. Returns undefined for anything it cannot
 * fully trust, so callers only ever see a valid session or none at all.
 */
export async function readSessionToken(token: string | undefined): Promise<SessionPayload | undefined> {
  if (!token) return undefined;

  const [body, signature] = token.split(".");
  if (!body || !signature) return undefined;

  try {
    // crypto.subtle.verify is constant-time, so no separate comparison is needed.
    const valid = await crypto.subtle.verify(
      "HMAC",
      await importKey(),
      decodeBase64Url(signature),
      new TextEncoder().encode(body),
    );
    if (!valid) return undefined;

    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(body))) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return undefined;
    if (!payload.email || !payload.name) return undefined;
    return payload;
  } catch {
    return undefined;
  }
}

/** Cookie attributes shared by the login and logout routes. */
export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;
