import { afterEach, describe, expect, it, vi } from "vitest";

import { buildRawMessage, encodeHeaderValue, missingGmailConfig } from "./gmailDriver";
import { EmailError, type EmailMessage } from "./types";

/**
 * What goes into the raw message, and what is refused before it can.
 *
 * Gmail takes an RFC 2822 message rather than JSON, so this driver builds
 * headers by hand — which makes header injection its problem and nobody else's.
 */

function message(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    to: { name: "Dimas Anggara", address: "dimas.anggara@example.com" },
    subject: "Persetujuan Termination",
    html: "<p>Mohon persetujuan.</p>",
    ...overrides,
  };
}

function decode(raw: string): string {
  return Buffer.from(raw, "base64url").toString("utf8");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("header encoding", () => {
  it("leaves plain ASCII alone", () => {
    expect(encodeHeaderValue("Persetujuan Termination")).toBe("Persetujuan Termination");
  });

  it("encodes the characters our subjects actually carry", () => {
    // The em dash comes from the renderer and the arrow from the redirect, so
    // a subject that is pure ASCII is the exception here, not the rule.
    const encoded = encodeHeaderValue("[→ a@b.com] Termination — Clara");
    expect(encoded).toMatch(/^=\?UTF-8\?B\?/);
    expect(Buffer.from(encoded.slice(10, -2), "base64").toString("utf8")).toContain("→");
  });
});

describe("building the message", () => {
  it("writes the headers Gmail needs", () => {
    const raw = decode(buildRawMessage(message(), "hc-noreply@gmail.com"));

    expect(raw).toContain("From: hc-noreply@gmail.com");
    expect(raw).toContain("dimas.anggara@example.com");
    expect(raw).toContain('Content-Type: text/html; charset="UTF-8"');
  });

  it("separates headers from the body with a blank line", () => {
    const raw = decode(buildRawMessage(message(), "hc-noreply@gmail.com"));
    const [headers, body] = raw.split("\r\n\r\n");

    expect(headers).toContain("MIME-Version: 1.0");
    expect(Buffer.from(body.replaceAll("\r\n", ""), "base64").toString("utf8")).toBe(
      "<p>Mohon persetujuan.</p>",
    );
  });

  it("wraps the base64 body so no line exceeds 76 characters", () => {
    const html = `<p>${"x".repeat(5000)}</p>`;
    const raw = decode(buildRawMessage(message({ html }), "hc-noreply@gmail.com"));
    const body = raw.split("\r\n\r\n")[1];

    expect(body.split("\r\n").every((line) => line.length <= 76)).toBe(true);
  });
});

describe("header injection", () => {
  it("refuses a subject that could start a new header", () => {
    // The redirect writes a directory address into the subject. A newline
    // surviving that would let whatever follows be read as another header.
    expect(() =>
      buildRawMessage(message({ subject: "Halo\r\nBcc: diam-diam@example.com" }), "me@gmail.com"),
    ).toThrow(EmailError);
  });

  it("refuses a recipient address carrying a newline", () => {
    expect(() =>
      buildRawMessage(
        message({ to: { address: "ok@example.com\nBcc: lain@example.com" } }),
        "me@gmail.com",
      ),
    ).toThrow(/baris baru/);
  });

  it("refuses a recipient display name carrying a newline", () => {
    expect(() =>
      buildRawMessage(
        message({ to: { name: "Dimas\r\nX: y", address: "ok@example.com" } }),
        "me@gmail.com",
      ),
    ).toThrow(EmailError);
  });
});

describe("configuration", () => {
  it("names every value that is missing, not just the first", () => {
    vi.stubEnv("GMAIL_CLIENT_ID", "");
    vi.stubEnv("GMAIL_CLIENT_SECRET", "");
    vi.stubEnv("GMAIL_REFRESH_TOKEN", "");
    vi.stubEnv("GMAIL_SENDER", "");

    expect(missingGmailConfig()).toEqual([
      "GMAIL_CLIENT_ID",
      "GMAIL_CLIENT_SECRET",
      "GMAIL_REFRESH_TOKEN",
      "GMAIL_SENDER",
    ]);
  });

  it("reports only what is actually absent", () => {
    vi.stubEnv("GMAIL_CLIENT_ID", "id");
    vi.stubEnv("GMAIL_CLIENT_SECRET", "secret");
    vi.stubEnv("GMAIL_REFRESH_TOKEN", "");
    vi.stubEnv("GMAIL_SENDER", "me@gmail.com");

    expect(missingGmailConfig()).toEqual(["GMAIL_REFRESH_TOKEN"]);
  });
});
