import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import { fail } from "@/lib/http/apiResponse";

import { hasPermission, type Permission } from "./roles";
import { SESSION_COOKIE, resolveSession, type PortalSession } from "./session";

/**
 * Route-handler authorisation.
 *
 * This is the control. `proxy.ts` turns away requests with no session cookie at
 * all, but that is a network-layer convenience: it cannot see whether the
 * session behind the cookie is still valid, it does not know which permission a
 * given route needs, and Next's own documentation is explicit that a proxy may
 * be skipped or relocated and must never be the only check. So every guarded
 * handler resolves the session from the store and checks a permission here.
 *
 * Handlers ask for a permission, never a role. Which roles satisfy it lives in
 * roles.ts, so the authorisation matrix can be read — and later tested — in one
 * place instead of being scattered across route files.
 */

export type Guarded =
  | { ok: true; session: PortalSession }
  | { ok: false; response: NextResponse };

/**
 * The session id comes from the httpOnly cookie only.
 *
 * The previous version also accepted `Authorization: Bearer` for curl. That is
 * gone on purpose: it made every credential usable from a header, which is
 * exactly the shape that lets a copied value be replayed from anywhere. Machine
 * callers get their own identity when the worker API arrives; until then there
 * is one way in.
 */
async function currentSession(): Promise<PortalSession | undefined> {
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value);
}

/** Verifies the caller holds a live session. Identity only, no authority. */
export async function requireSession(): Promise<Guarded> {
  const session = await currentSession();

  if (!session) {
    return {
      ok: false,
      // 401, not 403: the caller has not proven who they are, and retrying
      // with credentials is the right next move.
      response: fail("Sesi tidak valid atau sudah berakhir. Silakan masuk lagi.", 401, {
        code: "UNAUTHENTICATED",
      }),
    };
  }

  return { ok: true, session };
}

/** Verifies the caller holds a live session that carries `permission`. */
export async function requirePermission(permission: Permission): Promise<Guarded> {
  const guarded = await requireSession();
  if (!guarded.ok) return guarded;

  if (!hasPermission(guarded.session.roles, permission)) {
    return {
      ok: false,
      // 403, not 401: we know exactly who this is, and signing in again will
      // not help. The permission is named so an operator can map the refusal
      // to a group that needs assigning — it reveals nothing the caller could
      // not already infer from being refused.
      response: fail("Akses ditolak. Peran Anda tidak mencakup tindakan ini.", 403, {
        code: "FORBIDDEN",
        requiredPermission: permission,
      }),
    };
  }

  return guarded;
}
