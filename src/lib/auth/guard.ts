import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import { fail } from "@/lib/http/apiResponse";

import { TOKEN_COOKIE, verifyAccessToken } from "./jwt";
import type { AccessTokenPayload } from "./types";

/**
 * Route-handler protection.
 *
 * proxy.ts already turns away unauthenticated traffic, but it is a network
 * layer: it can be bypassed by anything that reaches the app directly, and it
 * cannot know whether *this particular* route needs an admin. So every
 * protected handler re-checks here. Two independent checks is the point — the
 * proxy gives a good redirect, this one is the control.
 */

export type Guarded =
  | { ok: true; user: AccessTokenPayload }
  | { ok: false; response: NextResponse };

/**
 * Pulls the token from the httpOnly cookie the browser flow uses, falling back
 * to an `Authorization: Bearer` header so the API is usable from curl and from
 * non-browser clients that have no cookie jar.
 */
async function readToken(request: Request): Promise<string | undefined> {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    if (token) return token;
  }

  const store = await cookies();
  return store.get(TOKEN_COOKIE)?.value;
}

/** Verifies the caller holds a valid token. The spec's `VerifyToken`. */
export async function verifyToken(request: Request): Promise<Guarded> {
  const user = verifyAccessToken(await readToken(request));

  if (!user) {
    return {
      ok: false,
      // 401, not 403: the caller has not proven who they are, and retrying
      // with credentials is the right next move.
      response: fail("Sesi tidak valid atau sudah berakhir. Silakan masuk lagi.", 401, {
        code: "UNAUTHENTICATED",
      }),
    };
  }

  return { ok: true, user };
}

/** Verifies the caller is a signed-in ADMIN. */
export async function requireAdmin(request: Request): Promise<Guarded> {
  const guarded = await verifyToken(request);
  if (!guarded.ok) return guarded;

  if (guarded.user.role !== "ADMIN") {
    return {
      ok: false,
      // 403, not 401: we know exactly who this is, and signing in again will
      // not help. Retrying is pointless, so say so.
      response: fail("Akses ditolak. Tindakan ini hanya untuk admin.", 403, {
        code: "FORBIDDEN",
      }),
    };
  }

  return guarded;
}

/**
 * Verifies the caller is either an ADMIN or the owner of `userId`.
 *
 * This is what keeps GET/PUT /api/accounts/[id] from becoming a way to read or
 * rewrite anyone's account by guessing an id — the id in the URL is caller
 * input, so it is compared against the id in the verified token, never trusted
 * on its own.
 */
export async function requireSelfOrAdmin(request: Request, userId: string): Promise<Guarded> {
  const guarded = await verifyToken(request);
  if (!guarded.ok) return guarded;

  if (guarded.user.role !== "ADMIN" && guarded.user.sub !== userId) {
    return {
      ok: false,
      response: fail("Akses ditolak. Anda hanya dapat mengakses akun sendiri.", 403, {
        code: "FORBIDDEN",
      }),
    };
  }

  return guarded;
}
