import { mkdir, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { processLock } from "@/lib/db/processShared";
import { markStateFileSeen, readStateFile } from "@/lib/db/stateFile";
import { open, seal, type SealedPayload } from "@/lib/lifecycle/outboxCrypto";

/**
 * Two-step sign-in: who has an authenticator app enrolled, and the switch.
 *
 * The secret is the whole second factor — anyone holding it produces valid
 * codes — so it is stored sealed with OUTBOX_ENCRYPTION_KEY, the portal's one
 * encryption key, never in the clear. A copied data folder without the key
 * is not a set of second factors. The cost: change that key and every enrolled
 * authenticator stops matching, and each person is reset (scripts/mfa-reset.mjs)
 * and enrolls again.
 *
 * Its own file, like the sessions, because it changes on every sign-in (the
 * last accepted step) and the main store is rewritten whole on each write.
 */

/** LOGIN_2FA=off switches the second step off; anything else, or nothing, leaves it on. */
export function isLoginMfaEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.LOGIN_2FA?.trim().toLowerCase();
  return !(raw === "off" || raw === "false" || raw === "0" || raw === "no");
}

/** The name an authenticator app lists the account under. */
export function mfaIssuer(env: Record<string, string | undefined> = process.env): string {
  const brand = env.NEXT_PUBLIC_BRAND_NAME?.trim();
  return brand ? `${brand} HC Portal` : "HC Portal";
}

interface MfaRecord {
  /** accountKey of the person: the sAMAccountName, lower case. */
  userId: string;
  secret: SealedPayload;
  enrolledAt: string;
  /**
   * The last step a code was accepted for. A code at or below it is refused,
   * so one read over a shoulder cannot be used again in its thirty seconds.
   */
  lastStep: number;
}

interface MfaFile {
  enrollments: MfaRecord[];
}

export class MfaUnreadableError extends Error {
  constructor(userId: string, options?: ErrorOptions) {
    super(
      `Kunci 2FA milik ${userId} tidak bisa dibuka — OUTBOX_ENCRYPTION_KEY kemungkinan berubah. Reset 2FA orang ini (scripts/mfa-reset.mjs) lalu minta dia mendaftar ulang.`,
      options,
    );
    this.name = "MfaUnreadableError";
  }
}

function resolvePath(): string {
  const configured = process.env.HC_MFA_FILE?.trim() || "data/hc-mfa.json";
  return path.isAbsolute(configured)
    ? configured
    : path.join(/* turbopackIgnore: true */ process.cwd(), configured);
}

async function load(): Promise<MfaFile> {
  const raw = await readStateFile(resolvePath());
  if (raw === undefined) return { enrollments: [] };
  const parsed = JSON.parse(raw) as Partial<MfaFile>;
  return { enrollments: parsed.enrollments ?? [] };
}

async function persist(file: MfaFile): Promise<void> {
  const target = resolvePath();
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(file, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(tmp, target);
  markStateFileSeen(target);
}

const withLock = processLock("hc-mfa");

export interface Enrollment {
  userId: string;
  secret: string;
  enrolledAt: string;
  lastStep: number;
}

/** The person's enrolment, opened; undefined when they have none yet. */
export function readEnrollment(userId: string): Promise<Enrollment | undefined> {
  return withLock(async () => {
    const key = userId.toLowerCase();
    const record = (await load()).enrollments.find((entry) => entry.userId === key);
    if (!record) return undefined;
    let secret: string;
    try {
      secret = open(record.secret);
    } catch (error) {
      // Not "no enrolment": that would let whoever has the password enroll a
      // phone of their own. Refused until somebody resets it on purpose.
      throw new MfaUnreadableError(key, { cause: error });
    }
    return { userId: key, secret, enrolledAt: record.enrolledAt, lastStep: record.lastStep };
  });
}

/**
 * Stores a confirmed enrolment. Refuses to replace one that exists: a second
 * phone is added by resetting the first, never by signing in again.
 */
export function saveEnrollment(userId: string, secret: string, step: number, now = new Date()): Promise<boolean> {
  return withLock(async () => {
    const key = userId.toLowerCase();
    const file = await load();
    if (file.enrollments.some((entry) => entry.userId === key)) return false;
    file.enrollments.push({ userId: key, secret: seal(secret), enrolledAt: now.toISOString(), lastStep: step });
    await persist(file);
    return true;
  });
}

/**
 * Marks a step as used. False when it was used already, or an earlier one is
 * newer — the code is then refused even though the arithmetic matched.
 */
export function consumeStep(userId: string, step: number): Promise<boolean> {
  return withLock(async () => {
    const file = await load();
    const record = file.enrollments.find((entry) => entry.userId === userId.toLowerCase());
    if (!record || step <= record.lastStep) return false;
    record.lastStep = step;
    await persist(file);
    return true;
  });
}

/** Removes an enrolment; the person enrolls a new phone at their next sign-in. */
export function removeEnrollment(userId: string): Promise<boolean> {
  return withLock(async () => {
    const file = await load();
    const before = file.enrollments.length;
    file.enrollments = file.enrollments.filter((entry) => entry.userId !== userId.toLowerCase());
    if (file.enrollments.length === before) return false;
    await persist(file);
    return true;
  });
}

export function listEnrollments(): Promise<Array<{ userId: string; enrolledAt: string }>> {
  return withLock(async () =>
    (await load()).enrollments.map(({ userId, enrolledAt }) => ({ userId, enrolledAt })),
  );
}
