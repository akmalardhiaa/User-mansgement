import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/guard";
import { createPkce, outlookAuthorizeUrl } from "@/lib/email/outlook";

export const dynamic = "force-dynamic";

// Not exported: a route file may only export handlers and segment config, so
// the callback route keeps its own copy of this name.
const OUTLOOK_OAUTH_COOKIE = "hc_outlook_oauth";

/**
 * GET /api/email/outlook/connect — starts the one-time Outlook connection.
 *
 * Admin only. The PKCE verifier and the state value travel in a short-lived
 * httpOnly cookie scoped to the callback path: the state stops a forged
 * callback from attaching someone else's mailbox, and the verifier proves the
 * code is being redeemed by the same browser that asked for it.
 */
export async function GET(request: Request) {
  const guarded = await requireAdmin(request);
  if (!guarded.ok) return NextResponse.redirect(new URL("/login?next=/email-settings", request.url));

  let authorizeUrl: string;
  const { verifier, challenge, state } = createPkce();
  try {
    authorizeUrl = outlookAuthorizeUrl(challenge, state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Konfigurasi Outlook belum lengkap.";
    return NextResponse.redirect(new URL(`/email-settings?error=${encodeURIComponent(message)}`, request.url));
  }

  const store = await cookies();
  store.set(OUTLOOK_OAUTH_COOKIE, `${state}.${verifier}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/email/outlook",
    maxAge: 10 * 60,
  });

  return NextResponse.redirect(authorizeUrl);
}
