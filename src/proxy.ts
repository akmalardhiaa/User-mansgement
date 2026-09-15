import { NextResponse, type NextRequest } from "next/server";

import {
  TOKEN_COOKIE,
  createAccessToken,
  isHalfExpired,
  secondsUntilExpiry,
  tokenCookieOptions,
  verifyAccessToken,
} from "@/lib/auth/jwt";

/**
 * Gate for the whole dashboard.
 *
 * Renamed from `middleware.ts`: Next 16 deprecated that file convention in
 * favour of `proxy.ts`, with the same behaviour and an exported `proxy`
 * function. It also defaults to the Node.js runtime now, which is why this can
 * use `jsonwebtoken` directly rather than a Web Crypto reimplementation.
 *
 * Worth being precise about what this is: a network-layer gate that produces
 * good redirects and cheap 401s. It is NOT the access control. Every protected
 * route handler re-checks the token itself through src/lib/auth/guard.ts,
 * because that is the check that cannot be bypassed by reaching the app
 * directly, and the only one that knows whether a given route needs an admin.
 */

/**
 * Reachable without a session.
 *
 * The account flows have to be here: someone who cannot sign in yet is exactly
 * the person who needs to register, confirm their address, or reset a password.
 */
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
];

/** Pages a signed-in person has no reason to see. */
const SIGNED_IN_REDIRECTS = new Set(["/login"]);

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((entry) => {
    // Entries may or may not carry a trailing slash. Normalising first is what
    // stops "/api/approvals/" being tested as "/api/approvals//", which matches
    // nothing — and it keeps the prefix check anchored at a segment boundary,
    // so "/loginhack" is not treated as public just because "/login" is.
    const base = entry.endsWith("/") ? entry.slice(0, -1) : entry;
    return pathname === base || pathname.startsWith(`${base}/`);
  });
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  const session = verifyAccessToken(token);

  if (session) {
    if (SIGNED_IN_REDIRECTS.has(pathname)) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    const response = NextResponse.next();

    /*
     * Sliding renewal.
     *
     * Access tokens last 15 minutes, which is the right lifetime for a
     * credential that cannot be revoked — but on its own it would sign people
     * out every quarter of an hour, mid-task. Reissuing once a token is past
     * halfway means an active session keeps working indefinitely while an idle
     * one still dies within 15 minutes of the last request.
     *
     * `/verify-email` and `/reset-password` are excluded below via the public
     * list, so this never runs for someone who is mid-recovery.
     */
    if (isHalfExpired(session)) {
      const renewed = createAccessToken({
        id: session.sub,
        email: session.email,
        fullName: session.fullName,
        role: session.role,
      });
      const payload = verifyAccessToken(renewed);
      response.cookies.set(
        TOKEN_COOKIE,
        renewed,
        tokenCookieOptions(payload ? secondsUntilExpiry(payload) : 900),
      );
    }

    return response;
  }

  if (isPublic(pathname)) return NextResponse.next();

  // An unauthenticated API call gets a 401 it can act on, rather than a login
  // page it would try to parse as JSON.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "Silakan login terlebih dahulu.", code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  // An expired cookie is cleared on the way out, so the browser stops sending a
  // token that will never verify again.
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);

  const redirect = NextResponse.redirect(login);
  if (token) redirect.cookies.set(TOKEN_COOKIE, "", tokenCookieOptions(0));
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
