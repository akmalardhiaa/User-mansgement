import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { OutboxKeyError, open, seal } from "./outboxCrypto";

/**
 * The outbox holds a usable approval token until the message is sent. These
 * check that holding it is safe: unreadable without the key, and detectably
 * broken if anybody edits it.
 */

const KEY = randomBytes(32).toString("base64");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("round trip", () => {
  it("returns exactly what was sealed", () => {
    vi.stubEnv("OUTBOX_ENCRYPTION_KEY", KEY);

    const sealed = seal("token-abc");
    expect(open(sealed)).toBe("token-abc");
  });

  it("produces different ciphertext each time, so repeats are not recognisable", () => {
    vi.stubEnv("OUTBOX_ENCRYPTION_KEY", KEY);

    const a = seal("token-abc");
    const b = seal("token-abc");

    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });
});

describe("tampering", () => {
  it("refuses an edited ciphertext instead of yielding a different token", () => {
    vi.stubEnv("OUTBOX_ENCRYPTION_KEY", KEY);

    const sealed = seal("token-abc");
    const bytes = Buffer.from(sealed.ciphertext, "base64");
    bytes[0] ^= 0xff;

    expect(() => open({ ...sealed, ciphertext: bytes.toString("base64") })).toThrow();
  });

  it("refuses an edited authentication tag", () => {
    vi.stubEnv("OUTBOX_ENCRYPTION_KEY", KEY);

    const sealed = seal("token-abc");
    const tag = Buffer.from(sealed.tag, "base64");
    tag[0] ^= 0xff;

    expect(() => open({ ...sealed, tag: tag.toString("base64") })).toThrow();
  });

  it("cannot be opened with a different key", () => {
    vi.stubEnv("OUTBOX_ENCRYPTION_KEY", KEY);
    const sealed = seal("token-abc");

    vi.stubEnv("OUTBOX_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    expect(() => open(sealed)).toThrow();
  });
});

describe("the key itself", () => {
  it("is required in production rather than invented", () => {
    // A key generated at boot would silently destroy every queued message on
    // the next restart.
    vi.stubEnv("OUTBOX_ENCRYPTION_KEY", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(() => seal("x")).toThrow(OutboxKeyError);
  });

  it("falls back to a fixed demo key outside production", () => {
    vi.stubEnv("OUTBOX_ENCRYPTION_KEY", "");
    vi.stubEnv("NODE_ENV", "development");

    expect(open(seal("token-abc"))).toBe("token-abc");
  });

  it("rejects a key of the wrong length", () => {
    vi.stubEnv("OUTBOX_ENCRYPTION_KEY", randomBytes(31).toString("base64"));

    expect(() => seal("x")).toThrow(OutboxKeyError);
  });
});
