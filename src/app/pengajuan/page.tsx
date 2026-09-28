import Link from "next/link";

import { AccessDenied } from "@/components/auth/AccessDenied";
import {
  LifecycleStatusBadge,
  LifecycleTypeBadge,
} from "@/components/lifecycle/LifecycleStatusBadge";
import { buttonClasses } from "@/components/ui/Button";
import { Card, SelectField } from "@/components/ui/Field";
import { IconApprovals, IconUserPlus } from "@/components/ui/Icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { requirePageSession } from "@/lib/auth/current";
import { lifecycleStatusLabel, lifecycleTypeLabel as typeLabel } from "@/lib/i18n/labels";
import { getTranslations } from "@/lib/i18n/server";
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

export async function generateMetadata() {
  const { t } = await getTranslations();
  return { title: t.requests.metaTitle };
}

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
  const { t } = await getTranslations();
  const session = await requirePageSession("/pengajuan");
  if (!hasPermission(session.roles, "request.read")) {
    return <AccessDenied roles={session.roles} need={t.requests.needRead} />;
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
        eyebrow={t.requests.eyebrow}
        title={t.requests.title}
        description={t.requests.description}
        actions={
          canCreate ? (
            <Link href="/pengajuan/baru" className={buttonClasses()}>
              <IconUserPlus className="size-4" />
              {t.requests.newRequest}
            </Link>
          ) : null
        }
      />

      <Card className="overflow-hidden">
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-hairline p-4">
          <label className="flex flex-col gap-1.5 text-xs text-ink-muted">
            {t.requests.filterType}
            <SelectField
              name="type"
              defaultValue={type ?? ""}
              className="rounded-lg border border-hairline-strong bg-canvas/60 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            >
              <option value="">{t.requests.allTypes}</option>
              {LIFECYCLE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {typeLabel(t, value)}
                </option>
              ))}
            </SelectField>
          </label>

          <label className="flex flex-col gap-1.5 text-xs text-ink-muted">
            {t.requests.filterStatus}
            <SelectField
              name="status"
              defaultValue={params.status ?? ""}
              className="rounded-lg border border-hairline-strong bg-canvas/60 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            >
              <option value="">{t.requests.allStatuses}</option>
              {LIFECYCLE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {lifecycleStatusLabel(t, value)}
                </option>
              ))}
            </SelectField>
          </label>

          <button type="submit" className={buttonClasses("secondary", "sm")}>
            {t.requests.apply}
          </button>
          <Link
            href="/pengajuan"
            className="self-center text-xs text-ink-muted transition-colors hover:text-ink"
          >
            {t.requests.reset}
          </Link>

          <span className="ml-auto text-xs text-ink-faint">
            <span className="tnum text-ink">{requests.length}</span> {t.directory.countOf}{" "}
            <span className="tnum">{total}</span>
          </span>
        </form>

        {requests.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
            <span className="grid size-12 place-items-center rounded-full border border-hairline bg-elevated/60 text-ink-faint">
              <IconApprovals className="size-5" />
            </span>
            <p className="text-sm text-ink-muted">{t.requests.empty}</p>
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
                        {t.requests.raisedBy.replace("{name}", request.requester.name)} ·{" "}
                        {formatDate(request.createdAt)}
                        {request.version > 1
                          ? ` · ${t.requests.version.replace("{version}", String(request.version))}`
                          : ""}
                      </span>
                    </span>

                    {waitingOnMe ? (
                      <span className="rounded-md border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
                        {t.requests.waitingOnYou}
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
                {t.requests.previous}
              </Link>
            ) : (
              <span />
            )}
            {offset + PAGE_SIZE < total ? (
              <Link
                href={`/pengajuan?offset=${offset + PAGE_SIZE}`}
                className="text-ink-muted transition-colors hover:text-ink"
              >
                {t.requests.next}
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
