import { describe, expect, it } from "vitest";

import { checkCsrf, selfOrigins, type CsrfCheckInput } from "./csrf";

const SELF = "https://portal.example.com";

function input(overrides: Partial<CsrfCheckInput> = {}): CsrfCheckInput {
  return {
    method: "POST",
    pathname: "/api/lifecycle-requests",
    expectedOrigin: SELF,
    origin: SELF,
    referer: null,
    hasSessionCookie: true,
    ...overrides,
  };
}

describe("what is protected", () => {
  it("allows a same-origin mutation", () => {
    expect(checkCsrf(input())).toEqual({ allowed: true });
  });

  it("refuses a mutation posted from another origin", () => {
    // The browser would attach the session cookie to this quite happily.
    expect(checkCsrf(input({ origin: "https://evil.example" }))).toEqual({
      allowed: false,
      reason: "ORIGIN_MISMATCH",
    });
  });

  it("refuses a cookie-bearing mutation that declares no origin at all", () => {
    expect(checkCsrf(input({ origin: null, referer: null }))).toEqual({
      allowed: false,
      reason: "ORIGIN_MISSING",
    });
  });

  it("falls back to Referer when Origin is absent", () => {
    expect(checkCsrf(input({ origin: null, referer: `${SELF}/pengajuan` }))).toEqual({
      allowed: true,
    });
  });

  it("refuses a Referer from somewhere else", () => {
    expect(checkCsrf(input({ origin: null, referer: "https://evil.example/x" }))).toEqual({
      allowed: false,
      reason: "ORIGIN_MISMATCH",
    });
  });

  it("ignores a malformed Origin rather than trusting it", () => {
    expect(checkCsrf(input({ origin: "not-a-url", referer: null }))).toEqual({
      allowed: false,
      reason: "ORIGIN_MISSING",
    });
  });
});

describe("what is not protected, and why", () => {
  it("lets reads through", () => {
    for (const method of ["GET", "HEAD"]) {
      expect(checkCsrf(input({ method, origin: "https://evil.example" }))).toEqual({
        allowed: true,
      });
    }
  });

  it("lets through a request that carries no cookie", () => {
    // Nothing to hijack: a request supplying its own credentials cannot be
    // forged by making somebody else's browser send it.
    expect(
      checkCsrf(input({ hasSessionCookie: false, origin: "https://evil.example" })),
    ).toEqual({ allowed: true });
  });

  it("exempts the approval action, which Outlook posts with no Origin", () => {
    expect(
      checkCsrf(input({ pathname: "/api/approval-actions", origin: null, referer: null })),
    ).toEqual({ allowed: true });
  });

  it("exempts a path below the exempt one", () => {
    expect(
      checkCsrf(input({ pathname: "/api/approval-actions/confirm", origin: null, referer: null })),
    ).toEqual({ allowed: true });
  });

  it("does not exempt a path that merely looks similar", () => {
    // A bare startsWith handed the exemption to this, and would hand it to a
    // future /api/approval-actions-v2 as well.
    expect(
      checkCsrf(input({ pathname: "/api/approval-actions-fake", origin: "https://evil.example" })),
    ).toEqual({ allowed: false, reason: "ORIGIN_MISMATCH" });
  });
});

describe("knowing this app's own origin", () => {
  /** What the proxy passes, for a request that arrived with this Host. */
  function self(host: string, overrides: Partial<Parameters<typeof selfOrigins>[0]> = {}) {
    return selfOrigins({
      host,
      protocol: "http:",
      forwardedProto: null,
      configured: undefined,
      framework: "http://localhost:3000",
      ...overrides,
    });
  }

  function post(origin: string, expectedOrigin: readonly string[]) {
    return checkCsrf(input({ origin, expectedOrigin }));
  }

  it("accepts the portal opened at 127.0.0.1, not only at localhost", () => {
    // `next dev` believes it is localhost whatever the browser typed.
    expect(post("http://127.0.0.1:3000", self("127.0.0.1:3000"))).toEqual({ allowed: true });
  });

  it("accepts the portal opened at the machine's LAN address", () => {
    expect(post("http://10.2.0.2:3000", self("10.2.0.2:3000"))).toEqual({ allowed: true });
  });

  it("accepts the portal in Docker, where the framework thinks it is 0.0.0.0", () => {
    const expected = self("localhost:3000", { framework: "http://0.0.0.0:3000" });
    expect(post("http://localhost:3000", expected)).toEqual({ allowed: true });
  });

  it("accepts https from the browser behind a TLS-terminating proxy", () => {
    const expected = self("portal.example.com", { forwardedProto: "https" });
    expect(post("https://portal.example.com", expected)).toEqual({ allowed: true });
  });

  it("accepts the published address from APP_BASE_URL", () => {
    const expected = self("internal:3000", { configured: "https://portal.example.com/" });
    expect(post("https://portal.example.com", expected)).toEqual({ allowed: true });
  });

  it("still refuses a forged request, whose Host is this site and whose Origin is not", () => {
    // The browser sets Host to where it is sending — here — and Origin to the
    // attacker's page. Reading Host does not let the attacker's origin in.
    expect(post("https://evil.example", self("localhost:3000"))).toEqual({
      allowed: false,
      reason: "ORIGIN_MISMATCH",
    });
  });

  it("ignores a forwarded scheme that is not http or https", () => {
    expect(self("localhost:3000", { forwardedProto: "javascript" })).toEqual([
      "http://localhost:3000",
    ]);
  });
});
