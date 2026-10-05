import { AdConfigurationError } from "./configError";
import { LdapAdDriver } from "./ldapAd";
import { readLdapAdConfig } from "./ldapConnection";
import type { AdDriver } from "./types";

/**
 * Which directory the worker talks to.
 *
 * Chosen explicitly by `AD_DRIVER`, never inferred. A deployment that has not
 * said which directory it is acting on is a deployment nobody has decided
 * about, and defaulting to the safe-sounding option would hide that.
 *
 * There is one answer, `ldap`. The simulated directory that used to be the
 * other one is gone: every account the worker reports on is an account a real
 * domain controller holds, in development as much as in production. Tests get
 * their directory from fakeLdapDirectory.ts, through the real driver, by way of
 * setAdDriverForTests below.
 */

let cached: AdDriver | undefined;

export { AdConfigurationError } from "./configError";

export function getAdDriver(): AdDriver {
  if (cached) return cached;

  const configured = process.env.AD_DRIVER?.trim().toLowerCase();

  if (configured === "ldap") {
    /*
     * The configuration is read here rather than inside the driver so a
     * deployment that is missing a variable fails when the driver is asked for
     * — at the first submit or the first sweep, with every missing name in one
     * message — instead of at the first write, halfway through executing an
     * approved request.
     *
     * Note what this does NOT check: whether the domain controller answers.
     * That is not knowable at construction time, and pretending otherwise
     * would replace a clear runtime failure with a startup one that says the
     * same thing less usefully.
     */
    cached = new LdapAdDriver(readLdapAdConfig());
    return cached;
  }

  if (configured === "mock") {
    // Named outright, because a .env written before the simulated directory
    // was removed still says this, and "not set" would send its owner looking
    // in the wrong place.
    throw new AdConfigurationError(
      "AD_DRIVER=mock sudah tidak ada: direktori simulasi telah dihapus dari aplikasi ini. Ganti menjadi AD_DRIVER=ldap dan isi konfigurasi AD (template: .env.onprem.example).",
    );
  }

  throw new AdConfigurationError(
    "AD_DRIVER belum diset. Isi AD_DRIVER=ldap beserta konfigurasi AD (template: .env.onprem.example).",
  );
}

/** True when a directory driver is configured at all. For status screens. */
export function isAdConfigured(): boolean {
  return Boolean(process.env.AD_DRIVER?.trim());
}

/** Drops the cached driver, so the next call reads AD_DRIVER again. */
export function resetAdDriver(): void {
  cached = undefined;
}

/**
 * Test seam: getAdDriver() returns this driver until resetAdDriver().
 *
 * How a test runs the worker against fakeLdapDirectory.ts through the real
 * LdapAdDriver. Nothing in the application calls it.
 */
export function setAdDriverForTests(driver: AdDriver): void {
  cached = driver;
}

export type { AdDriver } from "./types";
