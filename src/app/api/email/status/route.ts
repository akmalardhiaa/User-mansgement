import { requireAdmin } from "@/lib/auth/guard";
import { getTestMode } from "@/lib/config/approvalEnv";
import { getOutlookConnection, outlookRedirectUri } from "@/lib/email/outlook";
import { fail, ok } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

/** GET /api/email/status — how mail is being sent right now. Admin only. Never returns a secret. */
export async function GET(request: Request) {
  const guarded = await requireAdmin(request);
  if (!guarded.ok) return guarded.response;

  try {
    const connection = await getOutlookConnection();
    const test = getTestMode();
    return ok({
      service: process.env.EMAIL_SERVICE?.trim().toLowerCase() || null,
      outlook: {
        clientIdConfigured: Boolean(process.env.OUTLOOK_CLIENT_ID?.trim()),
        redirectUri: outlookRedirectUri(),
        connection: connection
          ? {
              accountEmail: connection.accountEmail,
              displayName: connection.displayName,
              connectedAt: connection.createdAt.toISOString(),
            }
          : null,
      },
      testMode: { enabled: test.enabled, recipient: test.recipient ?? null },
    });
  } catch (error) {
    console.error("[email:status]", error);
    return fail("Gagal membaca status email.", 500);
  }
}
