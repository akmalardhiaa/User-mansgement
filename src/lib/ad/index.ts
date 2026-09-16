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

export class AdConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdConfigurationError";
  }
}

export function getAdDriver(): AdDriver {
  if (cached) return cached;

  const configured = process.env.AD_DRIVER?.trim().toLowerCase();
  const production = process.env.NODE_ENV === "production";

  if (configured === "ldap") {
    // The real driver arrives with the on-premise worker. Failing loudly beats
    // silently falling back to the mock, which is the one outcome that must
    // never happen.
    throw new AdConfigurationError(
      "AD_DRIVER=ldap belum tersedia. Worker Active Directory on-premise belum diimplementasikan.",
    );
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
