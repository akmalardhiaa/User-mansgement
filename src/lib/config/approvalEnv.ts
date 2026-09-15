/**
 * Configuration for the account approval workflow.
 *
 * Read lazily, like the rest of src/lib/config, so a change to .env.local takes
 * effect without a rebuild and a bad value fails where it is used.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: DAY_MS,
};

/**
 * How long an approval link stays valid, from APPROVAL_TOKEN_EXPIRY ("24h",
 * "30m", "7d"). Anything unparseable falls back to 24 hours rather than to
 * "never expires": a typo in config should never turn a link into a standing
 * key.
 */
export function getApprovalTokenTtlMs(): number {
  const raw = process.env.APPROVAL_TOKEN_EXPIRY?.trim() || "24h";
  const match = /^(\d+)\s*([smhd])$/i.exec(raw);
  if (!match) return DAY_MS;
  const amount = Number(match[1]);
  const unit = UNIT_MS[match[2].toLowerCase()];
  return amount > 0 && unit ? amount * unit : DAY_MS;
}

/** The TTL as a person reads it in an email, e.g. "24 jam". */
export function describeTtl(ms: number): string {
  if (ms % DAY_MS === 0) return `${ms / DAY_MS} hari`;
  if (ms % UNIT_MS.h === 0) return `${ms / UNIT_MS.h} jam`;
  return `${Math.round(ms / UNIT_MS.m)} menit`;
}

export interface TestMode {
  enabled: boolean;
  /** Every outgoing email goes here instead, while enabled. */
  recipient?: string;
}

/**
 * Test mode redirects every outgoing email to one inbox.
 *
 * It exists so a whole approval chain can be walked through with made-up
 * manager and CISO addresses without mailing real people. The intended
 * recipient is kept visible in the subject and at the top of the message, so a
 * redirected email is never mistaken for the real thing.
 */
export function getTestMode(): TestMode {
  const enabled = process.env.TEST_MODE?.trim().toLowerCase() === "true";
  const recipient = process.env.TEST_RECIPIENT?.trim() || undefined;
  return { enabled: enabled && Boolean(recipient), recipient };
}

/** Departments offered on the create-user form. Validated server-side too. */
export const DEPARTMENTS = [
  "Human Capital",
  "Research",
  "Equity Capital Markets",
  "Investment Banking",
  "Sales & Trading",
  "Risk Management",
  "Compliance",
  "Legal",
  "Finance & Accounting",
  "Operations",
  "Information Technology",
  "Cyber Security",
] as const;

export type Department = (typeof DEPARTMENTS)[number];

export function isDepartment(value: unknown): value is Department {
  return typeof value === "string" && (DEPARTMENTS as readonly string[]).includes(value);
}
