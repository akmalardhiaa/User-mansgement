import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Time-based one-time passwords (RFC 6238), the codes an authenticator app shows.
 *
 * Written against node:crypto rather than taken from a package: the algorithm is
 * an HMAC over a counter and thirty lines long, and a second factor is the last
 * place to add a dependency nobody here has read. The parameters are the ones
 * every authenticator app assumes when an otpauth URI names none — SHA-1, six
 * digits, thirty seconds — so Microsoft and Google Authenticator both work.
 */

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

/**
 * How many steps either side of now are accepted.
 *
 * One: a code typed in the last seconds of its window, or a phone a little out
 * of step with the server, still works. Wider would mean more valid codes at
 * any moment for somebody guessing.
 */
const DRIFT_STEPS = 1;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("Kunci 2FA bukan base32 yang sah.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new secret: 160 bits, the length RFC 4226 recommends for HMAC-SHA-1. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function stepAt(time: number): number {
  return Math.floor(time / 1000 / TOTP_STEP_SECONDS);
}

/** The code for one step. */
export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/** Only the digits: people paste "123 456" and phones insert spaces. */
export function normaliseCode(input: string): string {
  return input.replace(/\s+/g, "");
}

/**
 * The step a code belongs to, or undefined when it matches none near now.
 *
 * The caller keeps the step it last accepted and refuses anything at or below
 * it, so a code read over somebody's shoulder cannot be used a second time
 * within its thirty seconds. That check lives with the stored record rather
 * than here, because only the record knows what was used before.
 */
export function matchTotp(secret: string, input: string, now: number = Date.now()): number | undefined {
  const code = normaliseCode(input);
  if (!/^\d{6}$/.test(code)) return undefined;
  const current = stepAt(now);
  for (let offset = -DRIFT_STEPS; offset <= DRIFT_STEPS; offset += 1) {
    const step = current + offset;
    const expected = totpCode(secret, step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return step;
  }
  return undefined;
}

/**
 * The link an authenticator app reads from the QR code.
 *
 * The issuer appears twice — as the label prefix and as a parameter — because
 * older apps read one and newer apps the other.
 */
export function otpauthUri(issuer: string, account: string, secret: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
