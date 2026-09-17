import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdAccountState } from "@/lib/ad/types";

import { MockAdAuthError, authViaMockAd, isMockAdLoginEnabled } from "./mockAdAuth";

/**
 * Signing in against the simulated directory.
 *
 * The directory itself is stubbed rather than written to disk: what is worth
 * testing here is which accounts are let in and where their authority comes
 * from, not that JSON round-trips.
 *
 * The case this adapter exists for is the last describe block — roles resolved
 * from group membership. `devUsers.ts` writes roles out by hand, so before this
 * existed no login in the demo ever exercised the mapping that decides authority
 * in a real deployment.
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
    sAMAccountName: "sarah.wijaya",
    userPrincipalName: "sarah.wijaya@corp.example.com",
    displayName: "Sarah Wijaya",
    mail: "sarah.wijaya@example.com",
    department: "IT — Engineering",
    title: "Engineering Manager",
    enabled: true,
    ou: "OU=Karyawan,DC=corp,DC=example,DC=com",
    groups: [],
    ...overrides,
  };
}

function stub(...accounts: AdAccountState[]): void {
  directory.mockResolvedValue(accounts);
}

describe("who is let in", () => {
  it("accepts the shared demo password", async () => {
    stub(account());

    const user = await authViaMockAd("sarah.wijaya", "mock12345");

    expect(user?.username).toBe("sarah.wijaya");
    expect(user?.fullName).toBe("Sarah Wijaya");
    expect(user?.department).toBe("IT — Engineering");
  });

  it("turns away a wrong password", async () => {
    stub(account());

    expect(await authViaMockAd("sarah.wijaya", "salah")).toBeUndefined();
  });

  it("turns away an account that is not there", async () => {
    stub(account());

    expect(await authViaMockAd("tidak.ada", "mock12345")).toBeUndefined();
  });

  it("honours a configured password instead of the default", async () => {
    vi.stubEnv("MOCK_AD_PASSWORD", "rahasia");
    stub(account());

    expect(await authViaMockAd("sarah.wijaya", "rahasia")).toBeDefined();
    expect(await authViaMockAd("sarah.wijaya", "mock12345")).toBeUndefined();
  });
});

describe("an account that has been switched off", () => {
  it("cannot sign in", async () => {
    /*
     * The behaviour this adapter was worth building for. A Termination that runs
     * to completion disables the object in this very directory, so the person's
     * login stops working as a CONSEQUENCE of the request rather than as a
     * separate thing somebody remembered to do.
     */
    stub(account({ enabled: false }));

    expect(await authViaMockAd("sarah.wijaya", "mock12345")).toBeUndefined();
  });

  it("is refused even when its groups would carry authority", async () => {
    vi.stubEnv("AD_GROUP_ADMIN", "CN=HC Portal Admins");
    stub(
      account({
        enabled: false,
        groups: ["CN=HC Portal Admins,OU=Groups,DC=corp,DC=example,DC=com"],
      }),
    );

    expect(await authViaMockAd("sarah.wijaya", "mock12345")).toBeUndefined();
  });
});

describe("the names an account answers to", () => {
  it("accepts the account name", async () => {
    stub(account());
    expect(await authViaMockAd("sarah.wijaya", "mock12345")).toBeDefined();
  });

  it("accepts the user principal name", async () => {
    stub(account());
    expect(await authViaMockAd("sarah.wijaya@corp.example.com", "mock12345")).toBeDefined();
  });

  it("accepts the mail address, which is what people remember", async () => {
    stub(account());
    expect(await authViaMockAd("sarah.wijaya@example.com", "mock12345")).toBeDefined();
  });

  it("accepts DOMAIN\\user, the way a real bind would", async () => {
    stub(account());
    expect(await authViaMockAd("CORP\\sarah.wijaya", "mock12345")).toBeDefined();
  });

  it("ignores case", async () => {
    stub(account());
    expect(await authViaMockAd("Sarah.Wijaya", "mock12345")).toBeDefined();
  });

  it("refuses an empty username rather than matching the first account", async () => {
    stub(account());
    expect(await authViaMockAd("   ", "mock12345")).toBeUndefined();
  });
});

describe("where authority comes from", () => {
  it("resolves roles from group membership, not from a hardcoded list", async () => {
    vi.stubEnv("AD_GROUP_MANAGER", "CN=Division Managers");
    stub(
      account({
        groups: ["CN=Division Managers,OU=Groups,DC=corp,DC=example,DC=com"],
      }),
    );

    const user = await authViaMockAd("sarah.wijaya", "mock12345");

    expect(user?.roles).toEqual(["MANAGER"]);
  });

  it("gives no authority to somebody in no mapped group", async () => {
    // Signs in, sees their own profile, and nothing else. Being in the
    // directory proves identity; it grants nothing here.
    vi.stubEnv("AD_GROUP_MANAGER", "CN=Division Managers");
    stub(account({ groups: ["CN=HC-Base,OU=Groups,DC=corp,DC=example,DC=com"] }));

    const user = await authViaMockAd("sarah.wijaya", "mock12345");

    expect(user?.roles).toEqual([]);
  });

  it("does not confer a role from a group that merely reads alike", async () => {
    // The same partial-match trap roleMapping guards, reachable from a login.
    vi.stubEnv("AD_GROUP_ADMIN", "CN=HC Admins");
    stub(account({ groups: ["CN=Former HC Admins,OU=Archive,DC=corp,DC=example,DC=com"] }));

    const user = await authViaMockAd("sarah.wijaya", "mock12345");

    expect(user?.roles).toEqual([]);
  });
});

describe("what it refuses to be", () => {
  it("will not run in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    stub(account());

    await expect(authViaMockAd("sarah.wijaya", "mock12345")).rejects.toThrow(MockAdAuthError);
  });

  it("is off unless asked for explicitly", () => {
    expect(isMockAdLoginEnabled()).toBe(false);

    vi.stubEnv("MOCK_AD_LOGIN", "true");
    expect(isMockAdLoginEnabled()).toBe(true);
  });
});
