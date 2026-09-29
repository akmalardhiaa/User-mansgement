import { AdError, type AdErrorKind } from "./types";

/**
 * What the worker is allowed to do about a failure.
 *
 * The classification is the whole contract: TRANSIENT is retried, everything
 * else is not, and TIMEOUT_AFTER_WRITE is the one that says "the change may
 * already be in the directory — read before you touch anything". Guessing
 * "probably transient" for an unrecognised failure is how one approved change
 * becomes two applied ones, so anything not listed here is UNKNOWN.
 *
 * Mapped by NUMERIC result code rather than by error class name. ldapts exports
 * a class per code, and matching on `instanceof` would tie this file to that
 * library's naming — which has already changed once (`AlreadyExistsError` for
 * what the RFC calls entryAlreadyExists).
 */

/** RFC 4511 result codes, with AD's reading of them where it differs. */
const BY_CODE: Record<number, AdErrorKind> = {
  1: "UNKNOWN", // operationsError
  2: "UNKNOWN", // protocolError
  4: "UNKNOWN", // sizeLimitExceeded — the filter is wrong, not the server
  8: "PERMISSION", // strongerAuthRequired
  11: "TRANSIENT", // adminLimitExceeded: the DC is shedding load
  16: "CONFLICT", // noSuchAttribute — removing a value that is not there
  19: "CONFLICT", // constraintViolation: schema or policy said no
  20: "CONFLICT", // attributeOrValueExists
  21: "CONFLICT", // invalidAttributeSyntax
  32: "NOT_FOUND", // noSuchObject
  34: "UNKNOWN", // invalidDNSyntax: a DN this application built is malformed
  49: "PERMISSION", // invalidCredentials: the service account bind failed
  50: "PERMISSION", // insufficientAccessRights
  51: "TRANSIENT", // busy
  52: "TRANSIENT", // unavailable
  53: "CONFLICT", // unwillingToPerform: AD's answer to "enable this, no password"
  64: "CONFLICT", // namingViolation
  65: "CONFLICT", // objectClassViolation
  66: "CONFLICT", // notAllowedOnNonLeaf
  67: "CONFLICT", // notAllowedOnRDN
  68: "CONFLICT", // entryAlreadyExists
  69: "CONFLICT", // objectClassModsProhibited
  80: "UNKNOWN", // other
};

/**
 * Socket failures that prove nothing was sent.
 *
 * The distinction from a reset or a timeout is the reason this list exists: a
 * refused connection or an unresolvable host means the request never left, so
 * retrying is safe. A connection that died mid-conversation means the write may
 * well have landed.
 */
const NEVER_SENT = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH"]);

/** TLS problems. Not retryable: a certificate does not fix itself. */
const TLS_CODES = new Set([
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "ERR_TLS_HANDSHAKE_TIMEOUT",
]);

function codeOf(error: unknown): { numeric?: number; text?: string } {
  if (typeof error !== "object" || error === null) return {};
  const code = (error as { code?: unknown }).code;
  if (typeof code === "number") return { numeric: code };
  if (typeof code === "string") return { text: code };
  return {};
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Whether the failure happened before or after the request went out.
 *
 * "write" does not mean "a write failed" — it means a write had been SENT when
 * this happened, which is what turns a lost connection from a safe retry into
 * a state nobody knows.
 */
export type LdapPhase = "read" | "write";

export function toAdError(error: unknown, phase: LdapPhase, what: string): AdError {
  // Already classified — by a guard in the driver, or by the GUID decoder.
  if (error instanceof AdError) return error;

  const { numeric, text } = codeOf(error);
  const message = messageOf(error);
  const detail = `${what}: ${message}`;

  if (numeric !== undefined) {
    // timeLimitExceeded is the server giving up on a request it accepted.
    if (numeric === 3) {
      return phase === "write"
        ? new AdError("TIMEOUT_AFTER_WRITE", `${detail}. Perubahan mungkin sudah diterapkan.`)
        : new AdError("TRANSIENT", detail);
    }
    const kind = BY_CODE[numeric];
    if (kind) return new AdError(kind, `${detail} (kode LDAP ${numeric})`);
    return new AdError("UNKNOWN", `${detail} (kode LDAP ${numeric})`);
  }

  if (text && TLS_CODES.has(text)) {
    return new AdError(
      "UNKNOWN",
      `${detail}. Sertifikat domain controller tidak lolos verifikasi — periksa LDAP_CA_CERT_PATH dan nama host di LDAP_URL.`,
    );
  }

  if (text && NEVER_SENT.has(text)) {
    return new AdError("TRANSIENT", `${detail}. Koneksi tidak pernah terbentuk.`);
  }

  const lostMidFlight =
    text === "ECONNRESET" || text === "ETIMEDOUT" || text === "EPIPE" || /time(d)? ?out/i.test(message);

  if (lostMidFlight) {
    return phase === "write"
      ? new AdError("TIMEOUT_AFTER_WRITE", `${detail}. Perubahan mungkin sudah diterapkan.`)
      : new AdError("TRANSIENT", detail);
  }

  return new AdError("UNKNOWN", detail);
}
