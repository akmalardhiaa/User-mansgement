import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdConfigurationError, getAdDriver, resetAdDriver, setAdDriverForTests } from "./index";
import type { AdDriver } from "./types";

/**
 * Which directory the worker is handed.
 *
 * One answer: the LDAP driver, and only when AD_DRIVER says so. There is no
 * fallback and no inference from NODE_ENV. The simulated directory that used
 * to be the other answer has been removed, and a configuration that still asks
 * for it is refused by name rather than read as "not set".
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

  it("refuses AD_DRIVER=mock in development, and says the simulated directory is gone", () => {
    process.env.AD_DRIVER = "mock";

    expect(() => getAdDriver()).toThrowError(AdConfigurationError);
    expect(() => getAdDriver()).toThrowError(/dihapus/);
  });

  it("refuses AD_DRIVER=mock in production the same way", () => {
    process.env.AD_DRIVER = "mock";
    // NODE_ENV is read-only in the framework typings, hence the stub.
    vi.stubEnv("NODE_ENV", "production");

    expect(() => getAdDriver()).toThrowError(/dihapus/);
  });
});

describe("AD_DRIVER=ldap", () => {
  it("returns the real driver", () => {
    Object.assign(process.env, LDAP_ENV);

    expect(getAdDriver().name).toBe("ldap");
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

  it("does not fall back to anything when its configuration is wrong", () => {
    process.env.AD_DRIVER = "ldap";

    // The one outcome that must never happen: a deployment reporting accounts
    // as created and disabled that no directory has heard of.
    expect(() => getAdDriver()).toThrowError(AdConfigurationError);
  });
});

describe("the test seam", () => {
  it("hands out the installed driver until it is reset, whatever AD_DRIVER says", () => {
    const installed = { name: "fake" } as AdDriver;
    setAdDriverForTests(installed);

    expect(getAdDriver()).toBe(installed);

    resetAdDriver();
    expect(() => getAdDriver()).toThrowError(AdConfigurationError);
  });
});
