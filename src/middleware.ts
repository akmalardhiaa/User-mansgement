import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, readSessionToken } from "@/lib/auth/session";

/**
 * Gate for the whole dashboard.
 *
 * Everything is behind a session except the login screen, the auth endpoints
 * themselves, and the Jira webhook — Jira calls that one as a machine, with no
 * session to present, so it authenticates with its own shared secret instead
 * (see src/lib/jira/webhookPayload.ts). Locking it here would silently break
 * the approval chain.
 */
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout", "/api/webhooks/"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path));
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const session = await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (session) {
    // A signed-in user has no reason to see the login screen.
    if (pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (isPublic(pathname)) return NextResponse.next();

  // An unauthenticated API call gets a 401 it can act on, rather than a login
  // page it would try to parse as JSON.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Silakan login terlebih dahulu." }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
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
