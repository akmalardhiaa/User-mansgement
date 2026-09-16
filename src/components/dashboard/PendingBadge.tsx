import Link from "next/link";

import { pendingLabel, type PendingMarker } from "@/lib/lifecycle/pending";

/**
 * "Somebody has asked for a change to this person."
 *
 * Deliberately a different shape from StatusBadge, and deliberately a link.
 * The account badge states a fact; this one states an intention that has not
 * happened yet, and the useful next move is always to go and look at the
 * request itself.
 */
export function PendingBadge({ marker }: { marker: PendingMarker }) {
  return (
    <Link
      href={`/pengajuan/${marker.requestId}`}
      onClick={(event) => event.stopPropagation()}
      className="inline-flex items-center gap-1.5 rounded-md border border-warn/30 bg-warn/10 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-warn transition-colors hover:border-warn/60"
      title="Lihat pengajuan yang sedang berjalan"
    >
      <span className="size-1.5 rounded-full bg-warn" aria-hidden />
      {pendingLabel(marker)}
    </Link>
  );
}
