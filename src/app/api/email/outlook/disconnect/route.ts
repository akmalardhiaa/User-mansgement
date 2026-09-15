import { requireAdmin } from "@/lib/auth/guard";
import { disconnectOutlook } from "@/lib/email/outlook";
import { fail, ok } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";

/** POST /api/email/outlook/disconnect — forget the connected mailbox. Admin only. */
export async function POST(request: Request) {
  const guarded = await requireAdmin(request);
  if (!guarded.ok) return guarded.response;

  try {
    await disconnectOutlook();
    return ok({ disconnected: true });
  } catch (error) {
    console.error("[email:outlook:disconnect]", error);
    return fail("Gagal memutuskan Outlook.", 500);
  }
}
