import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/guard";
import { completeOutlookConnection } from "@/lib/email/outlook";

export const dynamic = "force-dynamic";

const OUTLOOK_OAUTH_COOKIE = "hc_outlook_oauth";

function back(request: Request, params: Record<string, string>) {
  const url = new URL("/email-settings", request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

/**
 * GET /api/email/outlook/callback — Microsoft sends the admin back here.
 *
 * Every outcome lands on the settings page with a message, never on a JSON
 * error: this URL is opened by a browser mid-login, and a raw error body there
 * is a dead end.
 */
export async function GET(request: Request) {
  const guarded = await requireAdmin(request);
  if (!guarded.ok) return NextResponse.redirect(new URL("/login?next=/email-settings", request.url));

  const url = new URL(request.url);
  const store = await cookies();
  const saved = store.get(OUTLOOK_OAUTH_COOKIE)?.value ?? "";
  store.set(OUTLOOK_OAUTH_COOKIE, "", { path: "/api/email/outlook", maxAge: 0 });

  const microsoftError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (microsoftError) {
    return back(request, { error: `Microsoft: ${microsoftError.split(/\r?\n/)[0]}` });
  }

  const [expectedState, verifier] = saved.split(".");
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!expectedState || !verifier || state !== expectedState || !code) {
    return back(request, { error: "Sesi penghubungan tidak cocok atau kedaluwarsa. Klik Hubungkan Outlook sekali lagi." });
  }

  try {
    const accountEmail = await completeOutlookConnection(code, verifier, guarded.user.sub);
    return back(request, { connected: accountEmail });
  } catch (error) {
    return back(request, { error: error instanceof Error ? error.message : "Gagal menghubungkan Outlook." });
  }
}
