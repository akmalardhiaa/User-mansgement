import { describe, expect, it } from "vitest";

import { AdConfigurationError } from "@/lib/ad/configError";

import { isLdapLoginConfigured, readLdapLoginConfig } from "./ldapLoginConfig";

const COMPLETE = {
  AD_LDAP_URL: "ldaps://dc.corp.example.com:636",
  AD_BASE_DN: "DC=corp,DC=example,DC=com",
  LDAP_CA_CERT_PATH: "C:\\certs\\corp-root-ca.pem",
  LDAP_DOMAIN: "corp.example.com",
};

describe("LDAP login configuration", () => {
  it("uses the same LDAPS endpoint and base DN as the worker when provided", () => {
    expect(readLdapLoginConfig(COMPLETE)).toEqual({
      url: "ldaps://dc.corp.example.com:636",
      domain: "corp.example.com",
      baseDn: "DC=corp,DC=example,DC=com",
      caCertPath: "C:\\certs\\corp-root-ca.pem",
    });
  });

  it("accepts the legacy login variable names as aliases", () => {
    expect(
      readLdapLoginConfig({
        LDAP_URL: "ldaps://dc.corp.example.com",
        LDAP_BASE_DN: "DC=corp,DC=example,DC=com",
        LDAP_CA_CERT_PATH: "C:\\certs\\corp-root-ca.pem",
      }).url,
    ).toBe("ldaps://dc.corp.example.com");
  });

  it("reports whether an LDAP endpoint is configured without treating mock login as AD", () => {
    expect(isLdapLoginConfigured({ MOCK_AD_LOGIN: "true" })).toBe(false);
    expect(isLdapLoginConfigured({ AD_LDAP_URL: "ldaps://dc.corp.example.com" })).toBe(true);
  });

  it("requires a base DN and trusted CA", () => {
    expect(() => readLdapLoginConfig({ AD_LDAP_URL: COMPLETE.AD_LDAP_URL })).toThrowError(
      /AD_BASE_DN.*LDAP_CA_CERT_PATH/,
    );
  });

  it("refuses plaintext LDAP and non-LDAPS ports", () => {
    expect(() =>
      readLdapLoginConfig({ ...COMPLETE, AD_LDAP_URL: "ldap://dc.corp.example.com:389" }),
    ).toThrowError(AdConfigurationError);
    expect(() =>
      readLdapLoginConfig({ ...COMPLETE, AD_LDAP_URL: "ldaps://dc.corp.example.com:3269" }),
    ).toThrowError(/636/);
  });
});
