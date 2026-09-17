import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdAccountState } from "@/lib/ad/types";

import { authenticateAD } from "./ad";

/**
 * Which credential source answers, and in what order.
 *
 * `authenticateAD` picks between three of them — a real domain controller, the
 * simulated directory, and the hardcoded demo list — and the choice had no tests
 * at all. The one that matters most is the fall-through: turning on mock login
 * must not lock anybody out of the demo accounts, because those are the only way
 * into the portal on a fresh checkout.
 *
 * LDAP itself is not covered here. It needs a domain controller, and pretending
 * otherwise by mocking `ldapts` would test the mock rather than the bind.
 */

vi.mock("@/lib/ad/mockAd", () => ({
  readMockDirectory: vi.fn(),
}));

const { readMockDirectory } = await import("@/lib/ad/mockAd");
const directory = vi.mocked(readMockDirectory);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function account(overrides: Partial<AdAccountState> = {}): AdAccountState {
  return {
    objectGUID: "guid-1",
    sAMAccountName: "ayu.prameswari",
    userPrincipalName: "ayu.prameswari@corp.example.com",
    displayName: "Ayu Prameswari",
    mail: "ayu.prameswari@example.com",
    department: "Human Capital",
    title: "Head of Human Capital",
    enabled: true,
    ou: "OU=Karyawan,DC=corp,DC=example,DC=com",
    groups: ["CN=HC Officers,OU=Groups,DC=corp,DC=example,DC=com"],
    ...overrides,
  };
}

/** Switches on mock login with the role mapping the seeder writes. */
function withMockDirectory(...accounts: AdAccountState[]): void {
  vi.stubEnv("MOCK_AD_LOGIN", "true");
  vi.stubEnv("AD_GROUP_HC", "CN=HC Officers,OU=Groups,DC=corp,DC=example,DC=com");
  directory.mockResolvedValue(accounts);
}

describe("with the simulated directory switched off", () => {
  it("signs in a demo account", async () => {
    const user = await authenticateAD("admin", "admin12345");

    expect(user?.username).toBe("admin");
    expect(user?.roles).toContain("SYSTEM_ADMIN");
  });

  it("never reads the simulated directory", async () => {
    await authenticateAD("admin", "admin12345");

    expect(directory).not.toHaveBeenCalled();
  });

  it("refuses a wrong password", async () => {
    expect(await authenticateAD("admin", "salah")).toBeNull();
  });
});

describe("with the simulated directory switched on", () => {
  it("signs in a directory account, with roles from its groups", async () => {
    withMockDirectory(account());

    const user = await authenticateAD("ayu.prameswari", "mock12345");

    expect(user?.username).toBe("ayu.prameswari");
    expect(user?.roles).toEqual(["HC_REQUESTER"]);
  });

  it("STILL signs in the demo accounts", async () => {
    /*
     * The regression this file exists for. `admin` lives only in devUsers.ts, so
     * an implementation that refused anything the directory did not recognise
     * would lock somebody out of their own portal the moment they enabled this.
     */
    withMockDirectory(account());

    const user = await authenticateAD("admin", "admin12345");

    expect(user?.username).toBe("admin");
    expect(user?.roles).toContain("SYSTEM_ADMIN");
  });

  it("does not let the demo list rescue a directory account's wrong password", async () => {
    // Falling through must widen which NAMES are accepted, never which
    // passwords: ayu exists in the directory and nowhere else, so a wrong
    // password for her is simply a failed login.
    withMockDirectory(account());

    expect(await authenticateAD("ayu.prameswari", "salah")).toBeNull();
  });

  it("refuses a directory account that has been disabled", async () => {
    // A completed Termination switches the object off; the login has to stop
    // working as a consequence rather than as a separate manual step.
    withMockDirectory(account({ enabled: false }));

    expect(await authenticateAD("ayu.prameswari", "mock12345")).toBeNull();
  });
});

describe("what is refused outright", () => {
  it("rejects an empty username or password without consulting anything", async () => {
    vi.stubEnv("MOCK_AD_LOGIN", "true");

    expect(await authenticateAD("", "mock12345")).toBeNull();
    expect(await authenticateAD("ayu.prameswari", "")).toBeNull();
    expect(directory).not.toHaveBeenCalled();
  });

  it("will not fall back to demo accounts in production", async () => {
    // A portal anyone can enter with `admin12345` because LDAP_URL was
    // forgotten is the failure this guard exists for.
    vi.stubEnv("NODE_ENV", "production");

    await expect(authenticateAD("admin", "admin12345")).rejects.toThrow(/LDAP_URL/);
  });
});
