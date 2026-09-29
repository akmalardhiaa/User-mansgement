import { AdConfigurationError } from "./configError";
import { LdapAdDriver } from "./ldapAd";
import { readLdapAdConfig } from "./ldapConnection";
import { MockAdDriver, type FaultMode } from "./mockAd";
import type { AdDriver } from "./types";

/**
 * Which directory the worker talks to.
 *
 * Chosen explicitly by `AD_DRIVER`, never inferred. A deployment that has not
 * said which directory it is acting on is a deployment nobody has decided
 * about, and defaulting to the safe-sounding option would hide that.
 *
 * Production refuses the mock outright. The plan is explicit that a
 * misconfigured environment must fail to start rather than run in simulation
 * while looking real — a demo driver in production would report accounts as
 * created and disabled that no directory has ever heard of.
 */

export type AdDriverName = "mock" | "ldap";

let cached: AdDriver | undefined;

function parseFault(): FaultMode {
  const raw = process.env.AD_MOCK_FAULT?.trim().toLowerCase();
  if (!raw || raw === "none") return { kind: "none" };
  if (raw === "partial-groups") return { kind: "partial-groups" };
  if (raw === "timeout-after-write") return { kind: "timeout-after-write" };
  if (raw === "permission") return { kind: "permission" };

  const transient = /^transient:(\d+)$/.exec(raw);
  if (transient) return { kind: "transient", count: Number.parseInt(transient[1], 10) };

  throw new Error(
    `AD_MOCK_FAULT="${raw}" tidak dikenal. Pilihan: none, transient:<n>, partial-groups, timeout-after-write, permission.`,
  );
}

export { AdConfigurationError } from "./configError";

export function getAdDriver(): AdDriver {
  if (cached) return cached;

  const configured = process.env.AD_DRIVER?.trim().toLowerCase();
  const production = process.env.NODE_ENV === "production";

  if (configured === "ldap") {
    /*
     * The real directory.
     *
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
    if (production) {
      throw new AdConfigurationError(
        "AD_DRIVER=mock ditolak di production. Driver simulasi tidak boleh berjalan di lingkungan sungguhan.",
      );
    }
    cached = new MockAdDriver(parseFault());
    return cached;
  }

  throw new AdConfigurationError(
    "AD_DRIVER belum diset. Isi `mock` untuk demo, atau `ldap` setelah worker on-premise tersedia.",
  );
}

/** True when a directory driver is configured at all. For status screens. */
export function isAdConfigured(): boolean {
  return Boolean(process.env.AD_DRIVER?.trim());
}

/** Drops the cached driver. Tests and fault-mode changes need this. */
export function resetAdDriver(): void {
  cached = undefined;
}

export type { AdDriver } from "./types";
