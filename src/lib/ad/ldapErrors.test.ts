import { describe, expect, it } from "vitest";

import { toAdError } from "./ldapErrors";
import { AdError } from "./types";

class ResultError extends Error {
  constructor(readonly code: number) {
    super(`kode ${code}`);
  }
}

class SocketError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

describe("classifying an LDAP failure", () => {
  it("treats a busy or unavailable controller as retryable", () => {
    expect(toAdError(new ResultError(51), "read", "cari").kind).toBe("TRANSIENT");
    expect(toAdError(new ResultError(52), "read", "cari").retryable).toBe(true);
  });

  it("never retries a rights problem", () => {
    const error = toAdError(new ResultError(50), "write", "ubah");

    expect(error.kind).toBe("PERMISSION");
    expect(error.retryable).toBe(false);
  });

  it("maps the codes the worker acts on", () => {
    expect(toAdError(new ResultError(68), "write", "buat").kind).toBe("CONFLICT");
    expect(toAdError(new ResultError(32), "read", "cari").kind).toBe("NOT_FOUND");
    expect(toAdError(new ResultError(19), "write", "ubah").kind).toBe("CONFLICT");
    // AD answers "enable this account with no password" with unwillingToPerform.
    expect(toAdError(new ResultError(53), "write", "aktifkan").kind).toBe("CONFLICT");
  });

  it("does not guess at an unrecognised code", () => {
    const error = toAdError(new ResultError(4711), "write", "ubah");

    expect(error.kind).toBe("UNKNOWN");
    expect(error.retryable).toBe(false);
    expect(error.message).toContain("4711");
  });
});

describe("a connection that dies", () => {
  it("is retryable when the request never left", () => {
    expect(toAdError(new SocketError("ECONNREFUSED"), "write", "ubah").kind).toBe("TRANSIENT");
    expect(toAdError(new SocketError("ENOTFOUND"), "write", "ubah").kind).toBe("TRANSIENT");
  });

  it("is TIMEOUT_AFTER_WRITE once a write has been sent", () => {
    const error = toAdError(new SocketError("ECONNRESET"), "write", "ubah atribut");

    // The write may have landed. Sending it again is how one approved change
    // becomes two applied ones.
    expect(error.kind).toBe("TIMEOUT_AFTER_WRITE");
    expect(error.retryable).toBe(false);
  });

  it("is only transient when nothing had been written yet", () => {
    expect(toAdError(new SocketError("ECONNRESET"), "read", "baca").kind).toBe("TRANSIENT");
    expect(toAdError(new Error("Operation timed out"), "read", "baca").kind).toBe("TRANSIENT");
    expect(toAdError(new Error("Operation timed out"), "write", "tulis").kind).toBe(
      "TIMEOUT_AFTER_WRITE",
    );
  });
});

describe("a certificate that does not verify", () => {
  it("is reported as configuration, not as a retryable blip", () => {
    const error = toAdError(new SocketError("UNABLE_TO_VERIFY_LEAF_SIGNATURE"), "read", "bind");

    expect(error.kind).toBe("UNKNOWN");
    expect(error.retryable).toBe(false);
    expect(error.message).toContain("LDAP_CA_CERT_PATH");
  });
});

describe("an already-classified error", () => {
  it("passes through untouched, so a guard's reason survives", () => {
    const guard = new AdError("PERMISSION", "di luar AD_MANAGED_OUS");

    expect(toAdError(guard, "write", "ubah")).toBe(guard);
  });
});
