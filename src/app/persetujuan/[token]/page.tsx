import {
  LifecycleStatusBadge,
  LifecycleTypeBadge,
} from "@/components/lifecycle/LifecycleStatusBadge";
import { TokenDecisionForm } from "@/components/lifecycle/TokenDecisionForm";
import { BrandMark } from "@/components/ui/BrandMark";
import { Card } from "@/components/ui/Field";
import { IconAlert } from "@/components/ui/Icons";
import { previewByToken } from "@/lib/lifecycle/service";

export const dynamic = "force-dynamic";

export const metadata = { title: "Persetujuan · HC User Management" };

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}

/**
 * The decision page an approval email links to.
 *
 * Reachable without a portal session: the approver holds a link, and may have
 * no account here at all. Opening it decides nothing — it is a read, and the
 * form below posts separately — because mail scanners and link previewers
 * follow every URL in a message, and a page that approved on load would be
 * approved by a spam filter before a human saw it.
 *
 * The plan is equally clear about what this page is: the agreed fallback for
 * clients that cannot render an Actionable Message. It must never be presented
 * as satisfying "every action directly in the email".
 */
export default async function ApprovalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ putusan?: string }>;
}) {
  const { token } = await params;
  const { putusan } = await searchParams;
  const result = await previewByToken(token);

  /*
   * Which button was pressed in the email.
   *
   * Matched against a closed set rather than trusted: anything else is ignored
   * and the form opens neutral. This only preselects — the decision is still a
   * POST a person makes, because a page that decided on load would be decided
   * by the first scanner that followed the link.
   */
  const initial =
    putusan === "setuju" ? "APPROVED" : putusan === "tolak" ? "REJECTED" : undefined;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 py-4">
      <BrandMark />

      {!result.ok ? (
        <Card className="p-8">
          <p className="flex items-center gap-2 font-medium text-warn">
            <IconAlert className="size-4" />
            Tautan tidak dapat dipakai
          </p>
          <p className="mt-2 max-w-prose text-sm text-ink-muted">{result.reason}</p>
          <p className="mt-4 max-w-prose text-xs text-ink-faint">
            Bila Anda yakin seharusnya dapat memutuskan pengajuan ini, hubungi Human Capital untuk
            meminta tautan baru. Tautan lama sengaja tidak dapat dihidupkan kembali.
          </p>
        </Card>
      ) : (
        <>
          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <LifecycleTypeBadge type={result.preview.type} />
                  <LifecycleStatusBadge status={result.preview.status} />
                </div>
                <h1 className="mt-2 text-xl font-bold tracking-tight text-ink">
                  {result.preview.subjectName}
                </h1>
                <p className="mt-0.5 text-sm text-ink-muted">
                  Diajukan {result.preview.requesterName} · versi {result.preview.version}
                </p>
              </div>
            </div>

            {result.preview.managerDecision ? (
              <p className="mt-4 rounded-lg border border-ok/30 bg-ok/10 px-3.5 py-2.5 text-xs text-ok">
                Manager {result.preview.managerDecision.by} sudah menyetujui pada{" "}
                {formatDate(result.preview.managerDecision.at)}.
              </p>
            ) : null}

            {/*
              * The request's contents are deliberately not repeated here.
              *
              * The approval email carries every field, and the approver has
              * just read it — that is where the decision is actually made. This
              * page exists for one reason: a decision has to be a POST somebody
              * makes, because mail scanners follow every link in a message and
              * a GET that approved would be approved by a spam filter. So it
              * shows who and what, and then gets out of the way.
              */}
          </Card>

          <TokenDecisionForm token={token} stage={result.preview.stage} initial={initial} />

          <p className="text-center text-xs text-ink-faint">
            Tautan ini sekali pakai dan memiliki masa berlaku. Jangan meneruskannya.
          </p>
        </>
      )}
    </div>
  );
}
