import { NextResponse } from "next/server";

/**
 * CORS.
 *
 * The dashboard and its API are served from the same origin, so the browser
 * sends no cross-origin requests and no CORS headers are needed. This is
 * therefore closed by default: `CORS_ALLOWED_ORIGINS` is an explicit
 * comma-separated allowlist, and anything not on it gets no CORS headers at
 * all, which is what makes the browser block it.
 *
 * There is deliberately no wildcard. `Access-Control-Allow-Origin: *` cannot
 * be combined with credentials, and since the session lives in a cookie, a
 * wildcard here would either do nothing or — if paired with credentials by a
 * later edit — let any site on the internet make authenticated calls as a
 * signed-in user.
 */

function allowedOrigins(): string[] {
  return (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

/** Echoes the request origin only when it is on the allowlist. */
export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin")?.replace(/\/+$/, "");
  if (!origin || !allowedOrigins().includes(origin)) return {};

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600",
    // Responses differ by origin, so a shared cache must not serve one
    // origin's response to another.
    Vary: "Origin",
  };
}

/** Copies the CORS headers onto a response produced by a route handler. */
export function withCors(response: NextResponse, request: Request): NextResponse {
  for (const [key, value] of Object.entries(corsHeaders(request))) {
    response.headers.set(key, value);
  }
  return response;
}

/** Shared preflight handler. Export as `OPTIONS` from any route that needs one. */
export function preflight(request: Request): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}
