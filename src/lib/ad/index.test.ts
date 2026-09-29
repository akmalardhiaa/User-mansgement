import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdConfigurationError, getAdDriver, resetAdDriver } from "./index";

/**
 * Which directory the worker is handed.
 *
 * The rule being pinned here is the one that matters most in this file: a
 * deployment can end up talking to a simulated directory only by asking for
 * one. There is no fallback, no inference from NODE_ENV, and no "ldap is not
 * ready yet, use the mock" path — that last one existed, and is what these
 * tests replace.
 */

const LDAP_ENV: Record<string, string> = {
  AD_DRIVER: "ldap",
  AD_LDAP_URL: "ldaps://dc.corp.example.com",
  AD_BASE_DN: "DC=corp,DC=example,DC=com",
  AD_BIND_DN: "CN=svc-hc,OU=Service,DC=corp,DC=example,DC=com",
  AD_BIND_PASSWORD: "kata-sandi-akun-layanan",
  LDAP_CA_CERT_PATH: "/etc/ssl/corp-ca.pem",
  AD_MANAGED_OUS: "OU=Karyawan,DC=corp,DC=example,DC=com",
};

const TOUCHED = [...Object.keys(LDAP_ENV), "AD_LDAP_WRITE_ENABLED"];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(TOUCHED.map((name) => [name, process.env[name]]));
  for (const name of TOUCHED) delete process.env[name];
  resetAdDriver();
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetAdDriver();
});

describe("choosing a driver", () => {
  it("refuses to guess when nothing is configured", () => {
    expect(() => getAdDriver()).toThrowError(AdConfigurationError);
  });

  it("gives the simulated driver only when it is asked for by name", () => {
    process.env.AD_DRIVER = "mock";

    const driver = getAdDriver();
    expect(driver.name).toBe("mock");
    expect(driver.simulated).toBe(true);
  });

  it("never gives the simulated driver in production", () => {
    process.env.AD_DRIVER = "mock";
    // NODE_ENV is read-only in the framework typings, hence the stub.
    vi.stubEnv("NODE_ENV", "production");

    expect(() => getAdDriver()).toThrowError(/production/);
  });
});

describe("AD_DRIVER=ldap", () => {
  it("returns the real driver, and says it is not a simulation", () => {
    Object.assign(process.env, LDAP_ENV);

    const driver = getAdDriver();
    expect(driver.name).toBe("ldap");
    expect(driver.simulated).toBe(false);
  });

  it("is constructed without touching the network", () => {
    // Nothing here can reach a domain controller. Asking for the driver must
    // still succeed: whether the DC answers is a runtime question, and failing
    // at construction would only report it less usefully.
    Object.assign(process.env, LDAP_ENV);

    expect(() => getAdDriver()).not.toThrow();
  });

  it("fails with the missing variable names when it is half configured", () => {
    process.env.AD_DRIVER = "ldap";
    process.env.AD_LDAP_URL = LDAP_ENV.AD_LDAP_URL;

    expect(() => getAdDriver()).toThrowError(AdConfigurationError);
    expect(() => getAdDriver()).toThrowError(/AD_BIND_DN/);
  });

  it("does not fall back to the mock when its configuration is wrong", () => {
    process.env.AD_DRIVER = "ldap";

    // The one outcome that must never happen: a deployment reporting accounts
    // as created and disabled that no directory has heard of.
    expect(() => getAdDriver()).toThrowError(AdConfigurationError);
  });
});
