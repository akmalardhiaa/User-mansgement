import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/session";
import { checkCsrf } from "@/lib/http/csrf";
import { clientKey, rateLimit } from "@/lib/http/rateLimit";

/**
 * The network-layer gate.
 *
 * Three jobs, and it is worth being precise about which of them are security
 * controls and which are conveniences.
 *
 *   1. A Content-Security-Policy with a fresh nonce per request. This is a real
 *      control and can only live here: the nonce must be generated before the
 *      page renders, and Next reads it back off the request header to attach to
 *      its own scripts.
 *
 *   2. A cross-origin check on cookie-authenticated mutations. Also a real
 *      control, and also only possible here, because this is the layer that can
 *      see the method and the Origin together.
 *
 *   3. An optimistic redirect for somebody who is plainly signed out. This is
 *      NOT the access control. It checks only that a session cookie exists —
 *      not whether the session behind it is live, revoked, or permitted to do
 *      anything. Every route handler re-checks through `src/lib/auth/guard.ts`,
 *      and every page through `requirePageSession`.
 */

/**
 * Reachable without a session.
 *
 * The approval paths have to be here: an approver holds a link that was emailed
 * to them and may have no account in this portal at all. Their authentication is
 * the single-use token, checked by the handler — which is the only place that
 * can check it, and another reason this file is not the access control.
 */
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/persetujuan",
  "/api/approval-actions",
];

/** Pages a signed-in person has no reason to see. */
const SIGNED_IN_REDIRECTS = new Set(["/login"]);

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((entry) => {
    // Entries may or may not carry a trailing slash. Normalising first keeps
    // the prefix check anchored at a segment boundary, so "/loginhack" is not
    // treated as public just because "/login" is.
    const base = entry.endsWith("/") ? entry.slice(0, -1) : entry;
    return pathname === base || pathname.startsWith(`${base}/`);
  });
}

/**
 * The policy, rebuilt per request because the nonce is.
 *
 * `script-src` is where the strictness lives: a nonce plus `strict-dynamic`, so
 * only scripts this server vouched for run, and anything they load inherits
 * that trust rather than needing a host allowlist.
 *
 * `style-src` deliberately keeps `'unsafe-inline'`. A nonce does not apply to
 * inline style ATTRIBUTES, and this app renders them — Framer Motion writes
 * `style` on elements it animates, server-side included. Using a nonce there
 * would break the UI while blocking nothing, so the honest thing is to leave it
 * and say why rather than ship a policy that looks stricter than it is.
 *
 * Development additionally needs `'unsafe-eval'`: React uses `eval` there to
 * reconstruct server stacks in the browser. Production does not.
 */
function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function json(status: number, error: string, code: string): NextResponse {
  return NextResponse.json({ ok: false, error, code }, { status });
}

export async function proxy(request: NextRequest) {
  const { pathname, search, origin } = request.nextUrl;
  const isDev = process.env.NODE_ENV === "development";

  // Fresh per request, and unpredictable: a nonce an attacker can guess is a
  // nonce that allows their script.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, isDev);

  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  /*
   * Rate limits, before anything expensive.
   *
   * The approval endpoint gets its own, tighter bucket: it is the one mutation
   * reachable without a session, and the only one where guessing is even
   * theoretically the attack.
   *
   * Counted in this process's memory, which is real protection for a single
   * instance and NOT enough across several — every replica keeps its own
   * counter, so the effective limit multiplies. Production needs this at the
   * shared ingress.
   */
  const isApproval = pathname.startsWith("/api/approval-actions");
  if (pathname.startsWith("/api/") && request.method !== "GET") {
    const limit = isApproval
      ? rateLimit(clientKey(request, "approval"), 20, 5 * 60 * 1000)
      : rateLimit(clientKey(request, "api"), 120, 60 * 1000);

    if (!limit.allowed) {
      const response = json(429, "Terlalu banyak permintaan. Coba lagi sebentar lagi.", "RATE_LIMITED");
      response.headers.set("Retry-After", String(limit.retryAfter));
      response.headers.set("Content-Security-Policy", csp);
      return response;
    }
  }

  /*
   * Then the cross-origin check.
   *
   * Only cookie-authenticated mutations are at risk: the browser attaches the
   * session cookie to a form another site submitted, and the server sees a
   * request its own user never intended. Nothing about the session is wrong,
   * which is exactly why authentication cannot catch this.
   */
  const verdict = checkCsrf({
    method: request.method,
    pathname,
    expectedOrigin: origin,
    origin: request.headers.get("origin"),
    referer: request.headers.get("referer"),
    hasSessionCookie: hasCookie,
  });

  if (!verdict.allowed) {
    const response = json(
      403,
      "Permintaan ditolak karena berasal dari asal yang tidak dikenal.",
      verdict.reason,
    );
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  /** Every pass-through carries the nonce inward and the policy outward. */
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    // Next parses this request header to attach the nonce to its own script
    // tags. Without it, framework scripts are blocked by the policy below.
    headers.set("Content-Security-Policy", csp);

    const response = NextResponse.next({ request: { headers } });
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  if (hasCookie) {
    // Only a redirect away from the login page. Whether the cookie resolves to
    // a live session is decided downstream — if it does not, the login page is
    // where the person lands anyway, one hop later.
    if (SIGNED_IN_REDIRECTS.has(pathname)) {
      const redirect = NextResponse.redirect(new URL("/", request.url));
      redirect.headers.set("Content-Security-Policy", csp);
      return redirect;
    }
    return forward();
  }

  if (isPublic(pathname)) return forward();

  // An unauthenticated API call gets a 401 it can act on, rather than a login
  // page it would try to parse as JSON.
  if (pathname.startsWith("/api/")) {
    const response = json(401, "Silakan login terlebih dahulu.", "UNAUTHENTICATED");
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  const redirect = NextResponse.redirect(login);
  redirect.headers.set("Content-Security-Policy", csp);
  return redirect;
}

export const config = {
  /*
   * Everything except Next's own assets and static files served from /public.
   *
   * The extension check matters: without it the login page's own logo is
   * redirected to /login and renders broken, because the browser fetches it
   * while nobody is signed in yet.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf)$).*)",
  ],
};
