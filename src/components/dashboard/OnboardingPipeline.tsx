"use client";

import Link from "next/link";

import { RunWorkerButton } from "@/components/lifecycle/RunWorkerButton";
import { Card } from "@/components/ui/Field";
import { IconUserPlus } from "@/components/ui/Icons";
import type { OnboardingInFlight } from "@/lib/lifecycle/pending";
import type { LifecycleStatus } from "@/lib/lifecycle/types";

/**
 * People being onboarded, shown on the dashboard the moment they are raised.
 *
 * Kept apart from the employee table on purpose: these people have no account
 * yet, and the table's promise is that every row is an account the directory
 * confirmed. Here each one sits at a named step, and moves into the table only
 * when the worker has created the account and read it back.
 */

const STEPS = ["Diajukan", "Manager", "CISO", "Dibuat di AD"] as const;

/** Which step a request is on, and what to say about it. */
function describe(item: OnboardingInFlight): { step: number; label: string; tone: string } {
  const status: LifecycleStatus = item.status;
  switch (status) {
    case "DRAFT":
      return { step: 0, label: "Draf — belum dikirim ke approver", tone: "text-ink-muted" };
    case "PENDING_MANAGER":
      return { step: 1, label: `Menunggu persetujuan ${item.managerName}`, tone: "text-warn" };
    case "PENDING_CISO":
      return { step: 2, label: "Menunggu persetujuan tim CISO", tone: "text-warn" };
    case "EXECUTING":
      return { step: 3, label: "Sedang dibuat di AD…", tone: "text-info" };
    case "FAILED":
      return { step: 3, label: "Gagal dibuat di AD — buka detail untuk dicek", tone: "text-danger" };
    default:
      return { step: 3, label: "Disetujui — siap dibuat di AD", tone: "text-ok" };
  }
}

export function OnboardingPipeline({
  items,
  canRun,
}: {
  items: OnboardingInFlight[];
  /** Whether this viewer may run the worker that creates the accounts. */
  canRun: boolean;
}) {
  if (items.length === 0) return null;

  // An onboarding is never held for a date, so a scheduled one is as ready as a
  // queued one — the worker takes both.
  const ready = items.filter((item) =>
    ["QUEUED", "APPROVED", "SCHEDULED"].includes(item.status),
  ).length;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <IconUserPlus className="size-4 text-accent" />
            Karyawan baru dalam proses
            <span className="rounded-full border border-hairline px-2 py-0.5 text-[11px] text-ink-muted">
              {items.length}
            </span>
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            Tampil begitu diajukan. Akunnya belum ada — masuk ke tabel direktori setelah kedua
            persetujuan selesai dan akun dibuat di AD.
          </p>
        </div>
        {canRun && ready > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-ok">{ready} siap dibuat</span>
            <RunWorkerButton />
          </div>
        ) : null}
      </div>

      <ul className="mt-4 divide-y divide-hairline/60">
        {items.map((item) => {
          const { step, label, tone } = describe(item);
          return (
            <li key={item.requestId} className="grid gap-3 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{item.displayName}</p>
                <p className="truncate text-xs text-ink-muted">
                  {item.jobTitle} · {item.department} · <span className="font-mono">{item.email}</span>
                </p>
                <p className={`mt-1 text-xs ${tone}`}>{label}</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <ol className="flex items-center gap-1" aria-label={`Tahap: ${STEPS[step]}`}>
                  {STEPS.map((name, index) => (
                    <li key={name} className="flex items-center gap-1">
                      <span
                        className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${
                          index < step
                            ? "border-ok/30 bg-ok/10 text-ok"
                            : index === step
                              ? "border-accent/40 bg-accent/10 text-accent"
                              : "border-hairline text-ink-faint"
                        }`}
                      >
                        {name}
                      </span>
                      {index < STEPS.length - 1 ? (
                        <span className="text-[10px] text-ink-faint" aria-hidden>
                          ›
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ol>
                <Link
                  href={`/pengajuan/${item.requestId}`}
                  className="text-xs whitespace-nowrap text-accent hover:underline"
                >
                  Lihat pengajuan
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
