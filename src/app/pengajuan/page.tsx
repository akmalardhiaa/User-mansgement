import Link from "next/link";

import { AccessDenied } from "@/components/auth/AccessDenied";
import {
  LifecycleStatusBadge,
  LifecycleTypeBadge,
} from "@/components/lifecycle/LifecycleStatusBadge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Field";
import { IconApprovals, IconUserPlus } from "@/components/ui/Icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { requirePageSession } from "@/lib/auth/current";
import { hasPermission } from "@/lib/auth/roles";
import { isSamePerson } from "@/lib/lifecycle/routing";
import { identityOf, listRequests } from "@/lib/lifecycle/service";
import { stageAwaiting } from "@/lib/lifecycle/stateMachine";
import {
  LIFECYCLE_STATUSES,
  LIFECYCLE_TYPES,
  type LifecycleStatus,
  type LifecycleType,
} from "@/lib/lifecycle/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Pengajuan · HC User Management" };

const PAGE_SIZE = 25;

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}

/**
 * Every request this person may see.
 *
 * Filtering is a plain GET form rather than client state: the whole list comes
 * from the server anyway, and a filter that lives in the URL can be
 * bookmarked, shared with a colleague, and works before any JavaScript has run.
 *
 * Scope is applied by the service, not here. An approver sees what was routed
 * to them; HC and the oversight roles see everything.
 */
export default async function RequestListPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; offset?: string }>;
}) {
  const session = await requirePageSession("/pengajuan");
  if (!hasPermission(session.roles, "request.read")) {
    return <AccessDenied roles={session.roles} need="Izin membaca pengajuan" />;
  }

  const params = await searchParams;

  const type = (LIFECYCLE_TYPES as readonly string[]).includes(String(params.type))
    ? (params.type as LifecycleType)
    : undefined;
  const status = (LIFECYCLE_STATUSES as readonly string[]).includes(String(params.status))
    ? [params.status as LifecycleStatus]
    : undefined;
  const offset = Math.max(0, Number.parseInt(params.offset ?? "0", 10) || 0);

  const { requests, total } = await listRequests(session, {
    type,
    status,
    limit: PAGE_SIZE,
    offset,
  });

  const me = identityOf(session);
  const canCreate = hasPermission(session.roles, "request.create");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pengajuan"
        title="Daftar pengajuan"
        description="Onboarding, Movement, dan Termination. Status di sini adalah status pengajuannya — bukan keadaan akun, yang hanya berubah setelah perubahan benar-benar dijalankan."
        actions={
          canCreate ? (
            <Link href="/pengajuan/baru" className={buttonClasses()}>
              <IconUserPlus className="size-4" />
              Pengajuan baru
            </Link>
          ) : null
        }
      />

      <Card className="overflow-hidden">
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-hairline p-4">
          <label className="flex flex-col gap-1.5 text-xs text-ink-muted">
            Jenis
            <select
              name="type"
              defaultValue={type ?? ""}
              className="rounded-lg border border-hairline-strong bg-canvas/60 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            >
              <option value="">Semua jenis</option>
              {LIFECYCLE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-xs text-ink-muted">
            Status
            <select
              name="status"
              defaultValue={params.status ?? ""}
              className="rounded-lg border border-hairline-strong bg-canvas/60 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            >
              <option value="">Semua status</option>
              {LIFECYCLE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" className={buttonClasses("secondary", "sm")}>
            Terapkan
          </button>
          <Link
            href="/pengajuan"
            className="self-center text-xs text-ink-muted transition-colors hover:text-ink"
          >
            Reset
          </Link>

          <span className="ml-auto text-xs text-ink-faint">
            <span className="tnum text-ink">{requests.length}</span> dari{" "}
            <span className="tnum">{total}</span>
          </span>
        </form>

        {requests.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
            <span className="grid size-12 place-items-center rounded-full border border-hairline bg-elevated/60 text-ink-faint">
              <IconApprovals className="size-5" />
            </span>
            <p className="text-sm text-ink-muted">Belum ada pengajuan yang cocok.</p>
          </div>
        ) : (
          <ul className="divide-y divide-hairline/60">
            {requests.map((request) => {
              const awaiting = stageAwaiting(request.status);
              const step = awaiting
                ? request.approvals.find(
                    (candidate) =>
                      candidate.stage === awaiting && candidate.version === request.version,
                  )
                : undefined;
              const waitingOnMe = Boolean(step && isSamePerson(step.approver, me));

              return (
                <li key={request.id}>
                  <Link
                    href={`/pengajuan/${request.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-elevated/50"
                  >
                    <LifecycleTypeBadge type={request.type} />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">
                        {request.subject.displayName}
                      </span>
                      <span className="block truncate text-xs text-ink-faint">
                        Diajukan {request.requester.name} · {formatDate(request.createdAt)}
                        {request.version > 1 ? ` · versi ${request.version}` : ""}
                      </span>
                    </span>

                    {waitingOnMe ? (
                      <span className="rounded-md border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
                        Menunggu keputusan Anda
                      </span>
                    ) : null}

                    <LifecycleStatusBadge status={request.status} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {total > PAGE_SIZE ? (
          <div className="flex items-center justify-between border-t border-hairline px-4 py-3 text-sm">
            {offset > 0 ? (
              <Link
                href={`/pengajuan?offset=${Math.max(0, offset - PAGE_SIZE)}`}
                className="text-ink-muted transition-colors hover:text-ink"
              >
                ← Sebelumnya
              </Link>
            ) : (
              <span />
            )}
            {offset + PAGE_SIZE < total ? (
              <Link
                href={`/pengajuan?offset=${offset + PAGE_SIZE}`}
                className="text-ink-muted transition-colors hover:text-ink"
              >
                Berikutnya →
              </Link>
            ) : (
              <span />
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
