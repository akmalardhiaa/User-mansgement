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
  /** The app's own origin, e.g. https://portal.example.com. */
  expectedOrigin: string;
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

  const origin = originOf(input.origin);
  if (origin) {
    return origin === input.expectedOrigin
      ? { allowed: true }
      : { allowed: false, reason: "ORIGIN_MISMATCH" };
  }

  // Older browsers and some navigations omit Origin but send Referer.
  const referer = originOf(input.referer);
  if (referer) {
    return referer === input.expectedOrigin
      ? { allowed: true }
      : { allowed: false, reason: "ORIGIN_MISMATCH" };
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
