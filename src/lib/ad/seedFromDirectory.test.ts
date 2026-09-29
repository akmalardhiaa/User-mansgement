import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetAdDriver } from "./index";
import { seedMockAdFromDirectory } from "./seedFromDirectory";
import { AdError } from "./types";

/**
 * The fixture must never run against a real directory.
 *
 * This was already true and already commented, and it was true in a world
 * where `AD_DRIVER=ldap` threw before a driver could exist. Now that it returns
 * a working one, the guard is the only thing between a demo fixture and twenty
 * manufactured accounts in a production domain — so it gets a test rather than
 * a comment.
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

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(Object.keys(LDAP_ENV).map((name) => [name, process.env[name]]));
  Object.assign(process.env, LDAP_ENV);
  resetAdDriver();
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetAdDriver();
});

describe("seeding the simulated directory", () => {
  it("refuses outright when the driver is a real one", async () => {
    // Refused before the store is read and before a connection is opened:
    // nothing is created, and nothing is even asked of the directory.
    await expect(seedMockAdFromDirectory()).rejects.toMatchObject({ kind: "PERMISSION" });
    await expect(seedMockAdFromDirectory()).rejects.toBeInstanceOf(AdError);
  });
});
