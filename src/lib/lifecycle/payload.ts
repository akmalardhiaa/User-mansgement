import { createHash } from "node:crypto";

import type { LifecyclePayload } from "./types";

/**
 * Fingerprinting a submitted payload.
 *
 * An approval has to refer to something exact. Storing "Budi approved request
 * 42" is not enough if the text of request 42 can move underneath it, so every
 * decision is recorded against a hash of the payload as it stood — and any edit
 * produces a different hash, which is what makes a silently altered request
 * detectable rather than merely discouraged.
 *
 * The hash must therefore be stable for values that are equal and different for
 * values that are not. `JSON.stringify` alone gives neither guarantee: it
 * preserves insertion order, so two identical payloads built by different code
 * paths can serialise differently, and it drops `undefined`, so the difference
 * between "absent" and "explicitly nothing" disappears. Canonicalising first
 * fixes both.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/**
 * Recursively sorts object keys and removes undefined entries.
 *
 * Removing `undefined` rather than encoding it is deliberate: an optional field
 * left unset and one set to undefined mean the same thing to this domain, and
 * they must not hash differently.
 */
function canonicalise(value: unknown): Json {
  if (value === null) return null;

  if (Array.isArray(value)) {
    // Array order is meaningful and is left alone.
    return value.map(canonicalise);
  }

  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: { [key: string]: Json } = {};
    for (const key of Object.keys(source).sort()) {
      const entry = source[key];
      if (entry === undefined) continue;
      result[key] = canonicalise(entry);
    }
    return result;
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError("Payload memuat angka yang tidak terhingga.");
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  throw new TypeError(`Payload memuat nilai yang tidak dapat diserialisasi: ${typeof value}`);
}

/** The exact bytes that get hashed. Exposed so a test can show what changed. */
export function canonicalJson(payload: LifecyclePayload): string {
  return JSON.stringify(canonicalise(payload));
}

export function hashPayload(payload: LifecyclePayload): string {
  return createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");
}

/**
 * Whether a payload still matches the fingerprint a decision was taken against.
 *
 * Checked before every transition that relies on an earlier approval, so an
 * edit that slipped past the immutability rules still cannot be executed on the
 * strength of a decision made about different text.
 */
export function payloadMatches(payload: LifecyclePayload, expectedHash: string): boolean {
  return hashPayload(payload) === expectedHash;
}
