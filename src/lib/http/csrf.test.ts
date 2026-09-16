import { describe, expect, it } from "vitest";

import { checkCsrf, type CsrfCheckInput } from "./csrf";

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
