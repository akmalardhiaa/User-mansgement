/**
 * Environment for the account system.
 *
 * Read lazily, like src/lib/config/env.ts, so a missing variable fails at the
 * call site with a message naming the variable rather than blanking a page at
 * import time. Nothing here has a usable default: a fallback JWT secret would
 * be a signing key published in the repository.
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

/** Signs and verifies every JWT. Rotating it signs everyone out. */
export function getJwtSecret(): string {
  return required("JWT_SECRET", 32);
}

/** Absolute base for links inside emails — they leave the app, so relative URLs would be dead. */
export function getAppBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim() || process.env.APP_BASE_URL?.trim();
  return (configured || "http://localhost:3000").replace(/\/+$/, "");
}

export type EmailTransport = "gmail" | "smtp" | "sendgrid" | "resend" | "outlook" | "console";

export interface EmailConfig {
  transport: EmailTransport;
  from: string;
  user?: string;
  password?: string;
  apiKey?: string;
  host?: string;
  port?: number;
}

/**
 * Which mailer to use, and its credentials.
 *
 * Falls back to "console" when nothing is configured: registration then still
 * works end to end locally and the verification link is printed to the server
 * log instead of being sent. That keeps `npm run dev` usable before anyone has
 * SMTP credentials, and it never silently swallows a mail in production —
 * NODE_ENV=production with no transport configured throws instead.
 */
export function getEmailConfig(): EmailConfig {
  const service = process.env.EMAIL_SERVICE?.trim().toLowerCase();
  const user = process.env.EMAIL_USER?.trim();
  const password = process.env.EMAIL_PASSWORD?.trim();
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || user || "no-reply@localhost";

  if (service === "sendgrid") {
    if (!apiKey) throw new Error("EMAIL_SERVICE=sendgrid but SENDGRID_API_KEY is not set.");
    return { transport: "sendgrid", from, apiKey };
  }

  if (service === "outlook") {
    // Sends from the mailbox an admin connected through OAuth; the address
    // comes from that connection, and the tokens live in the database.
    if (!process.env.OUTLOOK_CLIENT_ID?.trim()) {
      throw new Error("EMAIL_SERVICE=outlook but OUTLOOK_CLIENT_ID is not set.");
    }
    return { transport: "outlook", from: "" };
  }

  if (service === "resend") {
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key) throw new Error("EMAIL_SERVICE=resend but RESEND_API_KEY is not set.");
    // Without a verified domain Resend only sends from its shared test address,
    // and only to the address the Resend account was registered with.
    return {
      transport: "resend",
      from: process.env.EMAIL_FROM?.trim() || "HC Portal <onboarding@resend.dev>",
      apiKey: key,
    };
  }

  if (service === "gmail") {
    if (!user || !password) {
      throw new Error("EMAIL_SERVICE=gmail but EMAIL_USER / EMAIL_PASSWORD are not set.");
    }
    // Google displays App Passwords in groups of four; the spaces are not part
    // of the password, and a pasted copy that keeps them fails to log in.
    return { transport: "gmail", from, user, password: password.replace(/s+/g, "") };
  }

  if (service === "smtp") {
    const host = process.env.EMAIL_HOST?.trim();
    if (!host) throw new Error("EMAIL_SERVICE=smtp but EMAIL_HOST is not set.");
    return {
      transport: "smtp",
      from,
      host,
      port: Number(process.env.EMAIL_PORT?.trim() || 587),
      user,
      password,
    };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "EMAIL_SERVICE is not set. Refusing to fall back to console logging in production — " +
        "verification and password-reset mail would never reach anyone. See .env.example.",
    );
  }

  return { transport: "console", from };
}

/**
 * True when the account system has everything it needs to let someone in.
 *
 * The login screen checks this so a missing variable shows as an explanation
 * on the page, rather than as a 500 the moment someone submits the form.
 */
export function isAccountSystemConfigured(): boolean {
  const secret = process.env.JWT_SECRET?.trim();
  return Boolean(secret && secret.length >= 32 && process.env.DATABASE_URL?.trim());
}

/** How long an emailed approval link stays valid. */
export function getApprovalTtlHours(): number {
  const raw = Number(process.env.APPROVAL_LINK_TTL_HOURS?.trim());
  return Number.isFinite(raw) && raw > 0 ? raw : 72;
}

export interface SecurityTeam {
  /** How the team is named in emails and in the audit trail. */
  name: string;
  /** Shared inbox the provisioning request is sent to. */
  email: string;
}

/**
 * The team that actually provisions or revokes the access.
 *
 * A shared team address rather than a named person: provisioning has to keep
 * working when whoever normally does it is on leave, and a request sitting in
 * one person's inbox is exactly how that stops happening.
 */
export function getSecurityTeam(): SecurityTeam {
  return {
    name: process.env.SECURITY_TEAM_NAME?.trim() || "Tim CISO Cyber Security",
    email: process.env.SECURITY_TEAM_EMAIL?.trim() || "",
  };
}

/**
 * True when outgoing email is really sent, false when it is only written to the
 * server log (EMAIL_SERVICE unset in development).
 *
 * The UI uses this to say which one happened. Telling HC "the approval email
 * was sent" when it was only logged is how someone ends up waiting on an inbox
 * that will never receive anything.
 */
export function isEmailDeliveryConfigured(): boolean {
  return Boolean(process.env.EMAIL_SERVICE?.trim());
}
