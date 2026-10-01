import { describe, expect, it } from "vitest";

import { AdConfigurationError } from "./configError";
import { readLdapAdConfig, type LdapEnv } from "./ldapConnection";

const COMPLETE: LdapEnv = {
  AD_LDAP_URL: "ldaps://dc.corp.example.com",
  AD_BASE_DN: "DC=corp,DC=example,DC=com",
  AD_BIND_DN: "CN=svc-hc,OU=Service,DC=corp,DC=example,DC=com",
  AD_BIND_PASSWORD: "kata-sandi-akun-layanan",
  LDAP_CA_CERT_PATH: "/etc/ssl/corp-ca.pem",
  AD_MANAGED_OUS: "OU=Karyawan,DC=corp,DC=example,DC=com;OU=Karantina,DC=corp,DC=example,DC=com",
};

describe("reading the driver configuration", () => {
  it("splits the managed OUs on semicolons and trims them", () => {
    const config = readLdapAdConfig(COMPLETE);

    expect(config.managedOus).toEqual([
      "OU=Karyawan,DC=corp,DC=example,DC=com",
      "OU=Karantina,DC=corp,DC=example,DC=com",
    ]);
  });

  it("keeps writing off until it is asked for explicitly", () => {
    expect(readLdapAdConfig(COMPLETE).writeEnabled).toBe(false);
    expect(readLdapAdConfig({ ...COMPLETE, AD_LDAP_WRITE_ENABLED: "yes" }).writeEnabled).toBe(false);
    expect(readLdapAdConfig({ ...COMPLETE, AD_LDAP_WRITE_ENABLED: "true" }).writeEnabled).toBe(true);
  });

  it("allows an empty OU allow-list during read-only validation", () => {
    expect(readLdapAdConfig({ ...COMPLETE, AD_MANAGED_OUS: "" }).managedOus).toEqual([]);
    expect(() =>
      readLdapAdConfig({
        ...COMPLETE,
        AD_MANAGED_OUS: "",
        AD_LDAP_WRITE_ENABLED: "true",
      }),
    ).toThrowError(/AD_MANAGED_OUS/);
  });

  it("keeps nested group resolution off by default", () => {
    expect(readLdapAdConfig(COMPLETE).nestedGroups).toBe(false);
    expect(readLdapAdConfig({ ...COMPLETE, LDAP_NESTED_GROUPS: "true" }).nestedGroups).toBe(true);
  });

  it("falls back to the login variables for the address and the search base", () => {
    const config = readLdapAdConfig({
      ...COMPLETE,
      AD_LDAP_URL: undefined,
      AD_BASE_DN: undefined,
      LDAP_URL: "ldaps://dc2.corp.example.com",
      LDAP_BASE_DN: "DC=corp,DC=example,DC=com",
    });

    expect(config.url).toBe("ldaps://dc2.corp.example.com");
    expect(config.baseDn).toBe("DC=corp,DC=example,DC=com");
  });
});

describe("a configuration that is not finished", () => {
  it("names every missing variable in one message", () => {
    let message = "";
    try {
      readLdapAdConfig({
        AD_LDAP_URL: "ldaps://dc.corp.example.com",
        AD_LDAP_WRITE_ENABLED: "true",
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    // One restart to learn all five, not five restarts to learn one each.
    expect(message).toContain("AD_BIND_DN");
    expect(message).toContain("AD_BIND_PASSWORD");
    expect(message).toContain("LDAP_CA_CERT_PATH");
    expect(message).toContain("AD_MANAGED_OUS");
    expect(message).toContain("AD_BASE_DN");
  });

  it("refuses an empty allow-list when writing is enabled", () => {
    expect(() =>
      readLdapAdConfig({
        ...COMPLETE,
        AD_MANAGED_OUS: "  ;  ",
        AD_LDAP_WRITE_ENABLED: "true",
      }),
    ).toThrowError(AdConfigurationError);
  });
});

describe("the address", () => {
  it("refuses plaintext LDAP", () => {
    // The service account password crosses this connection on every operation.
    expect(() =>
      readLdapAdConfig({ ...COMPLETE, AD_LDAP_URL: "ldap://dc.corp.example.com:389" }),
    ).toThrowError(/ldaps/);
  });

  it("refuses a port that is not 636", () => {
    expect(() =>
      readLdapAdConfig({ ...COMPLETE, AD_LDAP_URL: "ldaps://dc.corp.example.com:3269" }),
    ).toThrowError(/636/);
  });

  it("accepts port 636 spelled out", () => {
    expect(readLdapAdConfig({ ...COMPLETE, AD_LDAP_URL: "ldaps://dc.corp.example.com:636" }).url).toBe(
      "ldaps://dc.corp.example.com:636",
    );
  });

  it("refuses something that is not a URL at all", () => {
    expect(() => readLdapAdConfig({ ...COMPLETE, AD_LDAP_URL: "dc.corp.example.com" })).toThrowError(
      AdConfigurationError,
    );
  });
});

describe("the numbers", () => {
  it("has defaults, and refuses a value that is not a positive number", () => {
    expect(readLdapAdConfig(COMPLETE).timeoutMs).toBe(10_000);
    expect(readLdapAdConfig({ ...COMPLETE, LDAP_TIMEOUT_MS: "2500" }).timeoutMs).toBe(2500);
    expect(() => readLdapAdConfig({ ...COMPLETE, LDAP_TIMEOUT_MS: "0" })).toThrowError(
      AdConfigurationError,
    );
    expect(() => readLdapAdConfig({ ...COMPLETE, LDAP_PAGE_SIZE: "banyak" })).toThrowError(
      AdConfigurationError,
    );
  });
});
