import { afterEach, describe, expect, it, vi } from "vitest";

import {
  authenticateAD,
  isInvalidCredentials,
  isLdapConfigured,
  LdapUnavailableError,
  loginTlsOptions,
} from "./ad";

/**
 * Which credential source answers, and in what order.
 *
 * `authenticateAD` picks between two of them — a real domain controller, and
 * outside production the hardcoded demo list — and the choice had no tests at
 * all. The simulated directory that used to sit between the two is gone.
 *
 * LDAP itself is not covered here. It needs a domain controller, and pretending
 * otherwise by mocking `ldapts` would test the mock rather than the bind.
 */

const ldapMockState = vi.hoisted(() => ({
  bindError: undefined as unknown,
  /** What the last Client was constructed with, so a test can see where it connected. */
  options: undefined as { url?: string; tlsOptions?: { servername?: string } } | undefined,
}));

vi.mock("ldapts", () => ({
  Client: class {
    constructor(options: { url?: string; tlsOptions?: { servername?: string } }) {
      ldapMockState.options = options;
    }
    async bind() {
      if (ldapMockState.bindError) throw ldapMockState.bindError;
    }
    async search() {
      return { searchEntries: [] };
    }
    async unbind() {}
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  ldapMockState.bindError = undefined;
  ldapMockState.options = undefined;
});

describe("the demo accounts, outside production", () => {
  it("signs in a demo account", async () => {
    const user = await authenticateAD("admin", "admin12345");

    expect(user?.username).toBe("admin");
    expect(user?.roles).toContain("SYSTEM_ADMIN");
  });

  it("refuses a wrong password", async () => {
    expect(await authenticateAD("admin", "salah")).toBeNull();
  });
});

describe("what is refused outright", () => {
  it("recognizes the unified worker endpoint as the portal login endpoint", () => {
    vi.stubEnv("AD_LDAP_URL", "ldaps://dc.corp.example.com:636");
    vi.stubEnv("LDAP_URL", "");

    expect(isLdapConfigured()).toBe(true);
  });

  it("rejects an empty username or password without consulting anything", async () => {
    expect(await authenticateAD("", "admin12345")).toBeNull();
    expect(await authenticateAD("admin", "")).toBeNull();
  });

  it("will not fall back to demo accounts in production", async () => {
    // A portal anyone can enter with `admin12345` because LDAP_URL was
    // forgotten is the failure this guard exists for.
    vi.stubEnv("NODE_ENV", "production");

    await expect(authenticateAD("admin", "admin12345")).rejects.toThrow(/LDAP_URL/);
  });
});

describe("the login TLS boundary", () => {
  it("refuses ldap:// in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(loginTlsOptions("ldap://dc.corp.example.com:389")).rejects.toThrow(/LDAPS/);
  });

  it("keeps certificate and hostname verification enabled", async () => {
    const options = await loginTlsOptions("ldaps://dc.corp.example.com:636", {});

    expect(options).toEqual({
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
      servername: "dc.corp.example.com",
    });
  });

  it("recognises only LDAP result code 49 as invalid credentials", () => {
    expect(isInvalidCredentials({ code: 49 })).toBe(true);
    expect(isInvalidCredentials({ code: "49" })).toBe(false);
    expect(isInvalidCredentials({ code: 50 })).toBe(false);
    expect(isInvalidCredentials(new Error("invalid credentials"))).toBe(false);
    expect(isInvalidCredentials(null)).toBe(false);
  });

  it("returns null for code 49 but maps other bind failures to AD unavailable", async () => {
    vi.stubEnv("AD_LDAP_URL", "ldaps://dc.corp.example.com:636");
    vi.stubEnv("AD_BASE_DN", "DC=corp,DC=example,DC=com");
    ldapMockState.bindError = Object.assign(new Error("invalid credentials"), { code: 49 });
    await expect(authenticateAD("employee", "wrong")).resolves.toBeNull();

    ldapMockState.bindError = Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
    await expect(authenticateAD("employee", "secret")).rejects.toBeInstanceOf(LdapUnavailableError);
  });

  // A blank AD_LDAP_URL is common: the templates list both names, and somebody
  // fills in one. The login read the URL with `??`, which kept the blank, and
  // every sign-in became "server unreachable".
  it("falls back to LDAP_URL when AD_LDAP_URL is present but blank", async () => {
    vi.stubEnv("AD_LDAP_URL", "");
    vi.stubEnv("LDAP_URL", "ldaps://dc.corp.example.com:636");
    vi.stubEnv("AD_BASE_DN", "DC=corp,DC=example,DC=com");

    const user = await authenticateAD("employee", "secret");

    expect(user?.username).toBe("employee");
    expect(ldapMockState.options?.url).toBe("ldaps://dc.corp.example.com:636");
    expect(ldapMockState.options?.tlsOptions?.servername).toBe("dc.corp.example.com");
  });

  it("reports an unusable login configuration as AD unavailable, not as a crash", async () => {
    vi.stubEnv("AD_LDAP_URL", "ldaps://dc.corp.example.com:636");
    vi.stubEnv("AD_BASE_DN", "");
    vi.stubEnv("LDAP_BASE_DN", "");

    await expect(authenticateAD("employee", "secret")).rejects.toBeInstanceOf(LdapUnavailableError);
  });
});
