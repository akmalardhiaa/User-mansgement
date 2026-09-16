import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/**
 * Validating the identity on an Actionable Message action.
 *
 * NOT VERIFIED AGAINST A REAL TENANT. Everything here is written from the
 * documented model and cannot be proven correct until an Entra application is
 * registered, the Actionable Message provider is approved, and a real token is
 * seen. Treat the claim names and the issuer shape as the first thing to check
 * against a live proof of concept, not as settled.
 *
 * What it deliberately refuses to do:
 *
 *   - Assume `sub` is an email address. It is a pairwise identifier, different
 *     per application, and mapping it to a person by string-matching an inbox
 *     is how an approval gets attributed to the wrong human.
 *   - Assume the issuer is `substrate.office.com`. The legacy EAT model is not
 *     supported after 8 June 2026; the current model issues Entra ID tokens and
 *     the issuer follows the tenant.
 *   - Accept a Microsoft Graph token because it happens to be signed by
 *     Microsoft. A token minted for Graph is not a token for this API, and
 *     checking the audience is the whole difference.
 *
 * Unconfigured, this refuses outright rather than degrading into "trust the
 * bearer". The portal falls back to the emailed single-use token, which is the
 * agreed fallback and is no stronger than the link itself.
 */

export interface EntraConfig {
  tenantId: string;
  /** The Application ID URI this API exposes. A Graph token will not carry it. */
  audience: string;
  /**
   * Which client applications may present a token, when the tenant pins them.
   * Empty means "any client in the tenant", which is weaker and should be
   * narrowed once the Actions application id is confirmed.
   */
  allowedClientIds: string[];
}

export class EntraNotConfiguredError extends Error {
  constructor() {
    super(
      "Validasi identitas Microsoft belum dikonfigurasi. Isi ENTRA_TENANT_ID dan ENTRA_API_AUDIENCE, atau biarkan portal memakai fallback token email.",
    );
    this.name = "EntraNotConfiguredError";
  }
}

export class EntraTokenError extends Error {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "EntraTokenError";
  }
}

export function entraConfig(): EntraConfig | undefined {
  const tenantId = process.env.ENTRA_TENANT_ID?.trim();
  const audience = process.env.ENTRA_API_AUDIENCE?.trim();
  if (!tenantId || !audience) return undefined;

  return {
    tenantId,
    audience,
    allowedClientIds: (process.env.ENTRA_ALLOWED_CLIENT_IDS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  };
}

export function isEntraConfigured(): boolean {
  return entraConfig() !== undefined;
}

/** Who the token says is acting, in terms that identify a person stably. */
export interface VerifiedApprover {
  /** Entra object id — stable for the person within the tenant. */
  objectId: string;
  tenantId: string;
  /** Pairwise subject. Stable per application, useful only as a stored mapping. */
  subject: string;
  /** Display only. Never used to decide who somebody is. */
  email?: string;
}

/**
 * The claim checks, separated from the network so they can be tested.
 *
 * `jwtVerify` has already checked the signature, issuer, audience and time
 * window by the point this runs. What is left is what the library cannot know:
 * that the token belongs to the expected tenant, that it came from a client we
 * accept, and that it carries an identifier stable enough to map to an approver.
 */
export function assertClaims(payload: JWTPayload, config: EntraConfig): VerifiedApprover {
  const tid = typeof payload.tid === "string" ? payload.tid : undefined;
  if (tid !== config.tenantId) {
    throw new EntraTokenError("TENANT", "Token berasal dari tenant yang berbeda.");
  }

  if (config.allowedClientIds.length > 0) {
    const client =
      typeof payload.azp === "string"
        ? payload.azp
        : typeof payload.appid === "string"
          ? payload.appid
          : undefined;
    if (!client || !config.allowedClientIds.includes(client)) {
      throw new EntraTokenError("CLIENT", "Aplikasi pengirim token tidak diizinkan.");
    }
  }

  const objectId = typeof payload.oid === "string" ? payload.oid : undefined;
  if (!objectId) {
    // Without a stable id there is nothing to map to an approver. Falling back
    // to an email claim here is exactly the shortcut that misattributes a
    // decision, so it is refused instead.
    throw new EntraTokenError("SUBJECT", "Token tidak memuat object id yang stabil.");
  }

  const subject = typeof payload.sub === "string" ? payload.sub : "";
  if (!subject) throw new EntraTokenError("SUBJECT", "Token tidak memuat subject.");

  const email =
    typeof payload.preferred_username === "string"
      ? payload.preferred_username
      : typeof payload.upn === "string"
        ? payload.upn
        : undefined;

  return { objectId, tenantId: tid, subject, email };
}

/** Cached per tenant: fetching the key set on every action would be absurd. */
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function keySetFor(tenantId: string) {
  const existing = keySets.get(tenantId);
  if (existing) return existing;

  const created = createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`),
  );
  keySets.set(tenantId, created);
  return created;
}

export async function verifyEntraToken(bearer: string): Promise<VerifiedApprover> {
  const config = entraConfig();
  if (!config) throw new EntraNotConfiguredError();

  const token = bearer.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new EntraTokenError("MISSING", "Token tidak disertakan.");

  try {
    const { payload } = await jwtVerify(token, keySetFor(config.tenantId), {
      issuer: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
      audience: config.audience,
      // Only asymmetric signatures. An `alg: none` or HMAC token must never be
      // considered, whatever the key set happens to contain.
      algorithms: ["RS256", "PS256", "ES256"],
      clockTolerance: 60,
    });

    return assertClaims(payload, config);
  } catch (error) {
    if (error instanceof EntraTokenError) throw error;
    throw new EntraTokenError(
      "INVALID",
      `Token Microsoft tidak lolos verifikasi: ${error instanceof Error ? error.message : "tidak diketahui"}.`,
    );
  }
}

/** Drops cached key sets. For tests and for a tenant change without a restart. */
export function resetEntraKeyCache(): void {
  keySets.clear();
}
