import Link from "next/link";

import { IconInbox } from "@/components/ui/Icons";
import { getAccount } from "@/lib/accounts/service";
import { countMyApprovals } from "@/lib/approval/service";

/**
 * The approver's notification: shown on every page while requests wait on them.
 *
 * This is what replaces the email. Nothing has to be delivered anywhere — the
 * moment HC submits a request naming this person, the next page they load
 * says so.
 */
export async function PendingApprovalsNotice({ userId }: { userId: string }) {
  let count = 0;
  try {
    const me = await getAccount(userId);
    if (me) count = await countMyApprovals(me.email);
  } catch {
    // A database hiccup must not take every page down with it; the inbox page
    // still reports the problem if it persists.
    return null;
  }
  if (count === 0) return null;

  return (
    <div
      role="status"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-info/40 bg-info/10 px-4 py-3 text-sm"
    >
      <p className="flex items-center gap-2 text-info">
        <IconInbox className="size-4 shrink-0" />
        <span>
          <strong>{count} pengajuan</strong> menunggu persetujuan Anda.
        </span>
      </p>
      <Link href="/my-approvals" className="font-semibold text-info underline underline-offset-2">
        Buka Persetujuan saya
      </Link>
    </div>
  );
}
