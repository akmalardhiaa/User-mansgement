import { afterEach, describe, expect, it, vi } from "vitest";

import { AdConfigurationError } from "@/lib/ad/configError";

import {
  accessProfileGroups,
  accessProfileOu,
  configuredDepartmentOus,
  departmentOu,
  quarantineOu,
} from "./accessProfiles";

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

describe("the OU a division's accounts live in", () => {
  const FINANCE = "OU=Finance,OU=Karyawan,DC=corp,DC=internal";
  const ENGINEERING = "OU=Engineering,OU=Karyawan,DC=corp,DC=internal";

  it("reads explicit pairs, matching the division without regard to case or space", () => {
    const env = { AD_DEPARTMENT_OUS: `Finance=>${FINANCE}; IT — Engineering => ${ENGINEERING}` };

    expect(departmentOu("Finance", env)).toBe(FINANCE);
    expect(departmentOu("  it — engineering ", env)).toBe(ENGINEERING);
    expect(configuredDepartmentOus(env)).toHaveLength(2);
  });

  it("names the OU after the division under the parent, escaping what a DN needs", () => {
    const env = { AD_DEPARTMENT_OU_PARENT: "OU=Karyawan,DC=corp,DC=internal" };

    expect(departmentOu("Human Capital", env)).toBe("OU=Human Capital,OU=Karyawan,DC=corp,DC=internal");
    expect(departmentOu("Sales, Retail", env)).toBe("OU=Sales\\, Retail,OU=Karyawan,DC=corp,DC=internal");
  });

  it("lets an explicit pair win over the naming convention", () => {
    const env = {
      AD_DEPARTMENT_OUS: `Finance=>${FINANCE}`,
      AD_DEPARTMENT_OU_PARENT: "OU=Lain,DC=corp,DC=internal",
    };

    expect(departmentOu("Finance", env)).toBe(FINANCE);
  });

  it("gives no OU for a division neither one covers, or for no division", () => {
    const env = { AD_DEPARTMENT_OUS: `Finance=>${FINANCE}` };

    expect(departmentOu("Legal", env)).toBeUndefined();
    expect(departmentOu("", env)).toBeUndefined();
    expect(departmentOu(undefined, env)).toBeUndefined();
  });

  it("refuses a pair it cannot read, naming the entry", () => {
    const env = { AD_DEPARTMENT_OUS: `Finance=>${FINANCE};Legal OU=Legal,DC=corp` };

    expect(() => departmentOu("Finance", env)).toThrowError(AdConfigurationError);
    expect(() => departmentOu("Finance", env)).toThrowError(/Legal OU=Legal/);
  });
});
