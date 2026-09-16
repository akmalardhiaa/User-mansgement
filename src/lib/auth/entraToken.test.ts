import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EntraNotConfiguredError,
  EntraTokenError,
  assertClaims,
  entraConfig,
  isEntraConfigured,
  verifyEntraToken,
  type EntraConfig,
} from "./entraToken";

/**
 * The claim checks, which are the part that can be tested without a tenant.
 *
 * The signature verification cannot be: it needs a real key set from a real
 * Entra registration. That gap is the point of the warning on the module, and
 * these tests do not paper over it — they cover the decisions made AFTER a
 * signature has been accepted, which is where misattribution happens.
 */

const CONFIG: EntraConfig = {
  tenantId: "tenant-1",
  audience: "api://hc-user-management",
  allowedClientIds: [],
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configuration", () => {
  it("is absent until both tenant and audience are set", () => {
    vi.stubEnv("ENTRA_TENANT_ID", "tenant-1");
    vi.stubEnv("ENTRA_API_AUDIENCE", "");

    expect(entraConfig()).toBeUndefined();
    expect(isEntraConfigured()).toBe(false);
  });

  it("reads the allowed client list", () => {
    vi.stubEnv("ENTRA_TENANT_ID", "tenant-1");
    vi.stubEnv("ENTRA_API_AUDIENCE", "api://hc");
    vi.stubEnv("ENTRA_ALLOWED_CLIENT_IDS", " a , b ,");

    expect(entraConfig()?.allowedClientIds).toEqual(["a", "b"]);
  });

  it("refuses to verify anything while unconfigured, rather than trusting the bearer", async () => {
    vi.stubEnv("ENTRA_TENANT_ID", "");
    vi.stubEnv("ENTRA_API_AUDIENCE", "");

    await expect(verifyEntraToken("Bearer whatever")).rejects.toThrow(EntraNotConfiguredError);
  });
});

describe("claims", () => {
  it("accepts a token from the expected tenant with a stable object id", () => {
    const approver = assertClaims(
      { tid: "tenant-1", oid: "oid-1", sub: "sub-1", preferred_username: "sarah@example.com" },
      CONFIG,
    );

    expect(approver).toEqual({
      objectId: "oid-1",
      tenantId: "tenant-1",
      subject: "sub-1",
      email: "sarah@example.com",
    });
  });

  it("refuses a token from a different tenant", () => {
    expect(() => assertClaims({ tid: "other", oid: "oid-1", sub: "sub-1" }, CONFIG)).toThrow(
      EntraTokenError,
    );
  });

  it("refuses a token with no stable object id, rather than falling back to email", () => {
    // Matching a person by inbox is how a decision gets attributed to the wrong
    // human. Without an oid there is nothing safe to map, so it is refused.
    expect(() =>
      assertClaims({ tid: "tenant-1", sub: "sub-1", preferred_username: "sarah@example.com" }, CONFIG),
    ).toThrow(/object id/);
  });

  it("refuses a client application that is not on the allowlist", () => {
    const pinned: EntraConfig = { ...CONFIG, allowedClientIds: ["actions-app-id"] };

    expect(() =>
      assertClaims({ tid: "tenant-1", oid: "oid-1", sub: "sub-1", azp: "some-other-app" }, pinned),
    ).toThrow(/tidak diizinkan/);
  });

  it("accepts the pinned client, from either claim name", () => {
    const pinned: EntraConfig = { ...CONFIG, allowedClientIds: ["actions-app-id"] };

    expect(
      assertClaims({ tid: "tenant-1", oid: "oid-1", sub: "sub-1", azp: "actions-app-id" }, pinned)
        .objectId,
    ).toBe("oid-1");
    expect(
      assertClaims({ tid: "tenant-1", oid: "oid-1", sub: "sub-1", appid: "actions-app-id" }, pinned)
        .objectId,
    ).toBe("oid-1");
  });

  it("does not treat the subject as an email address", () => {
    // `sub` is pairwise and application-specific. It is kept for mapping, never
    // read as a mailbox.
    const approver = assertClaims({ tid: "tenant-1", oid: "oid-1", sub: "sub-1" }, CONFIG);

    expect(approver.subject).toBe("sub-1");
    expect(approver.email).toBeUndefined();
  });
});
