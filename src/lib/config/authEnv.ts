/**
 * Environment for the session layer.
 *
 * Read lazily so a missing variable fails at the call site with a message
 * naming the variable rather than blanking a page at import time. The JWT
 * secret has no usable default: a fallback would be a signing key published in
 * the repository.
 */

function required(name: string, minLength = 1): string {
  const value = process.env[name]?.trim();
  if (!value || value.length < minLength) {
    throw new Error(
      `${name} is missing or too short (${minLength}+ characters). See .env.example.`,
    );
  }
  return value;
}

/** Signs and verifies every session JWT. Rotating it signs everyone out. */
export function getJwtSecret(): string {
  return required("JWT_SECRET", 32);
}

/** Absolute base for the app, used when a link has to work outside the browser. */
export function getAppBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim() || process.env.APP_BASE_URL?.trim();
  return (configured || "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * True when the portal has what it needs to issue a session.
 *
 * The login screen checks this so a missing variable shows as an explanation on
 * the page rather than a 500 the moment someone submits. Only the JWT secret is
 * required now: accounts come from Active Directory (or the dev fallback), not
 * from a local database.
 */
export function isAccountSystemConfigured(): boolean {
  const secret = process.env.JWT_SECRET?.trim();
  return Boolean(secret && secret.length >= 32);
}
