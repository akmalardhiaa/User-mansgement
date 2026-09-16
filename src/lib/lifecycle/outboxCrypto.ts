import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encryption for the one thing the outbox has to hold in the clear-ish.
 *
 * The approval tables store only a hash of a token, which is enough to check
 * one. But the message has not been rendered yet when the decision to send is
 * committed, and the renderer needs the raw value to put in a link — so it has
 * to survive between the transaction that commits the event and the dispatcher
 * that sends it.
 *
 * Keeping it encrypted, under a key that is not the session key, is what stops
 * the outbox from becoming a table of usable approvals. The payload is deleted
 * once the message is accepted or the token expires, so the window is the queue
 * depth rather than the retention period.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
 * than yielding a different token.
 */

const ALGORITHM = "aes-256-gcm";

export class OutboxKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboxKeyError";
  }
}

/**
 * The key, from `OUTBOX_ENCRYPTION_KEY` — 32 bytes, base64.
 *
 * Deliberately NOT derived from the session secret. The plan is explicit that
 * outbox, OAuth and session keys are separate: rotating the one that signs
 * sessions must not make a queue of pending approvals undecryptable, and a
 * compromise of one must not hand over the others.
 *
 * Outside production a key is derived from a fixed string so the demo runs
 * without ceremony. In production a missing key is a configuration error, not a
 * reason to invent one — a generated-at-boot key would silently destroy every
 * queued message on restart.
 */
function key(): Buffer {
  const configured = process.env.OUTBOX_ENCRYPTION_KEY?.trim();

  if (configured) {
    const bytes = Buffer.from(configured, "base64");
    if (bytes.length !== 32) {
      throw new OutboxKeyError(
        `OUTBOX_ENCRYPTION_KEY harus 32 byte dalam base64 (terbaca ${bytes.length} byte).`,
      );
    }
    return bytes;
  }

  if (process.env.NODE_ENV === "production") {
    throw new OutboxKeyError(
      "OUTBOX_ENCRYPTION_KEY belum diset. Payload outbox tidak boleh disimpan tanpa enkripsi.",
    );
  }

  return createHash("sha256").update("hc-demo-outbox-key").digest();
}

export interface SealedPayload {
  /** Initialisation vector, base64. Fresh for every seal. */
  iv: string;
  /** GCM authentication tag, base64. */
  tag: string;
  ciphertext: string;
}

export function seal(plaintext: string): SealedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function open(sealed: SealedPayload): string {
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(sealed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
