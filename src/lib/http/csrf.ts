/**
 * Cross-site request forgery, decided as a pure function.
 *
 * The attack this prevents: a page on another origin makes the browser POST to
 * this app, and the browser helpfully attaches the session cookie. The server
 * sees a perfectly authenticated request that its own user never intended to
 * make. Nothing about the session is wrong — which is why authentication cannot
 * catch it and the request's SHAPE has to.
 *
 * Kept here, free of any Next or Node import, for two reasons: the proxy that
 * calls it should not drag a module graph along, and a rule this consequential
 * should be testable without standing up a server.
 */

/** Methods that can change something. GET and HEAD are not protected. */
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Paths exempt from the check.
 *
 * Only one, and it earns it: the approval action is authenticated by a
 * single-use token rather than a cookie, and it is posted by Outlook's servers,
 * which are not a browser and send no Origin. The plan calls this exception out
 * explicitly. Everything else that mutates goes through the check.
 */
const EXEMPT_PATHS = ["/api/approval-actions"];

export interface CsrfCheckInput {
  method: string;
  pathname: string;
  /**
   * The app's own origin, e.g. https://portal.example.com — or every origin it
   * is legitimately reached at for this request (see `selfOrigins`).
   */
  expectedOrigin: string | readonly string[];
  origin: string | null;
  referer: string | null;
  /** Only cookie-authenticated requests are at risk. */
  hasSessionCookie: boolean;
}

export type CsrfVerdict =
  | { allowed: true }
  | { allowed: false; reason: "ORIGIN_MISMATCH" | "ORIGIN_MISSING" };

function originOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Anchored at a path segment, never a bare prefix.
 *
 * A plain `startsWith` handed the exemption to anything that merely began with
 * the exempt path — `/api/approval-actions-fake` inherited it, and so would a
 * future `/api/approval-actions-v2`. An exemption that spreads to paths nobody
 * listed is how a CSRF hole appears in a route added months later.
 */
function matchesPath(pathname: string, exempt: string): boolean {
  return pathname === exempt || pathname.startsWith(`${exempt}/`);
}

export function checkCsrf(input: CsrfCheckInput): CsrfVerdict {
  if (!UNSAFE_METHODS.has(input.method.toUpperCase())) return { allowed: true };
  if (EXEMPT_PATHS.some((exempt) => matchesPath(input.pathname, exempt))) {
    return { allowed: true };
  }
  // No cookie, no confused deputy: a request carrying its own credentials
  // cannot be forged by making somebody else's browser send it.
  if (!input.hasSessionCookie) return { allowed: true };

  const expected = new Set(
    (typeof input.expectedOrigin === "string" ? [input.expectedOrigin] : input.expectedOrigin)
      .map((value) => originOf(value))
      .filter((value): value is string => Boolean(value)),
  );

  const origin = originOf(input.origin);
  if (origin) {
    return expected.has(origin) ? { allowed: true } : { allowed: false, reason: "ORIGIN_MISMATCH" };
  }

  // Older browsers and some navigations omit Origin but send Referer.
  const referer = originOf(input.referer);
  if (referer) {
    return expected.has(referer) ? { allowed: true } : { allowed: false, reason: "ORIGIN_MISMATCH" };
  }

  /*
   * Neither header, but a session cookie was attached.
   *
   * Refused rather than allowed. A browser sends Origin on cross-origin
   * requests, so its absence on a cookie-bearing mutation is either a client
   * deliberately hiding where it came from or one this app was not written for.
   * The cost is that `curl` with a copied cookie is rejected unless it sets
   * Origin — which is the right trade for the only endpoints this covers.
   */
  return { allowed: false, reason: "ORIGIN_MISSING" };
}

export interface SelfOriginInput {
  /** The `Host` header of this request. */
  host: string | null;
  /** The scheme this server itself received the request on, e.g. "http:". */
  protocol: string;
  /** `X-Forwarded-Proto`, set by a TLS-terminating proxy in front of the app. */
  forwardedProto: string | null;
  /** `APP_BASE_URL`, the address the app is published at. */
  configured: string | undefined;
  /** What the framework believes this server's origin is. */
  framework: string;
}

/**
 * Every origin this app is legitimately being reached at, for this request.
 *
 * Why the Host header, and why that is safe here. The framework's own idea of
 * its origin is whatever it was started with — `localhost`, or `0.0.0.0` under
 * `next dev -H 0.0.0.0` in Docker — not the address in the browser. Compared
 * against that, a portal opened at 127.0.0.1, at the machine's LAN address, or
 * inside the container refused every form it submitted, and under Docker it
 * refused them all.
 *
 * The Host header names the site the browser is actually talking to, and it is
 * the one part of a forged request the attacker does not control: a page on
 * another origin can make the victim's browser POST here, but the browser sets
 * Host to THIS site (that is where it is sending) and Origin to the attacker's.
 * A client that forges Host is not a browser carrying somebody else's cookie,
 * so there is no confused deputy to protect. And a DNS-rebinding page, which
 * does control the name the browser uses, never gets this site's cookie — the
 * cookie is bound to the name — so the check is not what stops it and nothing
 * is lost.
 *
 * `X-Forwarded-Proto` only ever changes the scheme for the same host. It lets a
 * portal behind an HTTPS proxy accept `https://` from the browser while the app
 * itself was reached over plain HTTP.
 */
export function selfOrigins(input: SelfOriginInput): string[] {
  const origins = new Set<string>();

  const add = (value: string | undefined | null) => {
    const origin = originOf(value ?? null);
    if (origin) origins.add(origin);
  };

  add(input.framework);
  add(input.configured);

  const host = input.host?.trim();
  if (host) {
    add(`${input.protocol.replace(/:$/, "")}://${host}`);
    const forwarded = input.forwardedProto?.split(",")[0]?.trim().toLowerCase();
    if (forwarded === "http" || forwarded === "https") add(`${forwarded}://${host}`);
  }

  return [...origins];
}
