import { afterEach, describe, expect, it, vi } from "vitest";

import { AdConfigurationError } from "@/lib/ad/configError";

import { accessProfileGroups, accessProfileOu, quarantineOu } from "./accessProfiles";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Active Directory access-profile configuration", () => {
  it("uses the configured OU and groups instead of demo directory names", () => {
    vi.stubEnv("AD_OU_STANDARD", "OU=People,DC=corp,DC=internal");
    vi.stubEnv("AD_ACCESS_GROUP_BASE", "CN=Employees,OU=Groups,DC=corp,DC=internal");
    vi.stubEnv("AD_QUARANTINE_OU", "OU=Disabled,DC=corp,DC=internal");

    expect(accessProfileOu("standard")).toBe("OU=People,DC=corp,DC=internal");
    expect(accessProfileGroups("standard")).toEqual(["CN=Employees,OU=Groups,DC=corp,DC=internal"]);
    expect(quarantineOu()).toBe("OU=Disabled,DC=corp,DC=internal");
  });

  it("refuses production defaults that would target the example domain", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AD_OU_STANDARD", "");
    vi.stubEnv("AD_QUARANTINE_OU", "");

    expect(() => accessProfileOu("standard")).toThrowError(AdConfigurationError);
    expect(() => quarantineOu()).toThrowError(AdConfigurationError);
  });

  it("does not use example-domain defaults for a real LDAP driver, including pilot mode", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AD_DRIVER", "ldap");
    vi.stubEnv("AD_OU_STANDARD", "");
    vi.stubEnv("AD_ACCESS_GROUP_BASE", "");
    vi.stubEnv("AD_QUARANTINE_OU", "");

    expect(() => accessProfileOu("standard")).toThrowError(AdConfigurationError);
    expect(() => accessProfileGroups("standard")).toThrowError(AdConfigurationError);
    expect(() => quarantineOu()).toThrowError(AdConfigurationError);
  });

  it("keeps the development defaults when no real directory is configured", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("AD_OU_STANDARD", "");
    vi.stubEnv("AD_ACCESS_GROUP_BASE", "");

    expect(accessProfileOu("standard")).toBe("OU=Karyawan,DC=corp,DC=example,DC=com");
    expect(accessProfileGroups("standard")).toEqual([
      "CN=HC-Base,OU=Groups,DC=corp,DC=example,DC=com",
    ]);
  });
});
