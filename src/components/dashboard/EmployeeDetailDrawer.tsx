"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";

import { PendingBadge } from "@/components/dashboard/PendingBadge";
import { Button } from "@/components/ui/Button";
import {
  IconBriefcase,
  IconBuilding,
  IconClose,
  IconDownload,
  IconMail,
  IconPower,
  IconSwap,
  IconUserCheck,
} from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { PendingMarker } from "@/lib/lifecycle/pending";
import { TRANSITION_FAST } from "@/lib/motion";
import type { Employee } from "@/lib/types";

interface EmployeeDetailDrawerProps {
  employee: Employee | null;
  /** The open lifecycle request for this person, if there is one. */
  pending?: PendingMarker;
  /** Whether this viewer may raise a lifecycle request. */
  canRequest?: boolean;
  onClose: () => void;
  onOpenReportPDF?: (employee: Employee) => void;
}

/**
 * One person, in detail.
 *
 * Three things were removed from this panel, and all three for the same reason:
 * they showed the user something that was not true.
 *
 *   - A "Riwayat Audit" tab listing four approval steps that were hard-coded.
 *     It rendered the same four lines for every employee, including people
 *     whose account had never been approved by anyone. The real trail lives on
 *     the request, and is now linked to instead.
 *   - A temporary-password generator that invented a string in the browser and
 *     announced it had been created. Nothing received it and no account had it.
 *     Initial credentials are the worker's job, over a channel HC agrees, and
 *     never through a page.
 *   - A "copy activation link" button producing a hard-coded URL on a domain
 *     this app does not serve.
 *
 * What is left states what the directory actually knows, and hands off to the
 * request flow for anything that would change it.
 */
function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function EmployeeDetailDrawer({
  employee,
  pending,
  canRequest = false,
  onClose,
  onOpenReportPDF,
}: EmployeeDetailDrawerProps) {
  if (!employee) return null;

  const rows: Array<[typeof IconBriefcase, string, string]> = [
    [IconBriefcase, "Jabatan", employee.jobTitle],
    [IconBuilding, "Divisi", employee.department],
    [IconUserCheck, "Manager", employee.managerName],
    [IconMail, "Email manager", employee.managerEmail],
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={TRANSITION_FAST}
          onClick={onClose}
          className="absolute inset-0 bg-canvas/70 backdrop-blur-sm"
        />

        <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="relative flex w-screen max-w-md flex-col justify-between overflow-y-auto border-l border-hairline-strong/80 bg-surface p-6 shadow-2xl"
          >
            <div>
              <div className="flex items-start justify-between gap-4 border-b border-hairline pb-5">
                <div className="flex items-center gap-3.5">
                  <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-accent/40 bg-accent/15 text-base font-bold text-accent shadow-[0_0_15px_rgba(253,183,19,0.2)]">
                    {initials(employee.displayName)}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold tracking-tight text-ink">
                      {employee.displayName}
                    </h2>
                    <p className="text-xs text-ink-muted">{employee.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Tutup panel"
                  className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-elevated hover:text-ink"
                >
                  <IconClose className="size-5" />
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <StatusBadge status={employee.status} />
                <span className="font-mono text-xs text-ink-faint">ID: {employee.id}</span>
              </div>

              <div className="mt-5 space-y-2.5 rounded-xl border border-hairline/80 bg-elevated/40 p-3.5 text-sm">
                {rows.map(([Glyph, label, value]) => (
                  <div key={label} className="flex items-center gap-2.5 text-ink-muted">
                    <Glyph className="size-4 text-accent" />
                    <span className="text-xs text-ink-faint">{label}:</span>
                    <span className="ml-auto min-w-0 truncate font-medium text-ink">{value}</span>
                  </div>
                ))}
              </div>

              {employee.description ? (
                <div className="mt-4 rounded-xl border border-hairline/80 bg-canvas/50 p-3.5">
                  <p className="text-xs font-medium text-ink-faint">Catatan HC:</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                    {employee.description}
                  </p>
                </div>
              ) : null}

              <div className="mt-4 rounded-xl border border-hairline/80 bg-canvas/50 p-3.5">
                <p className="text-xs font-semibold text-ink">Pengajuan berjalan</p>
                {pending ? (
                  <div className="mt-2">
                    <PendingBadge marker={pending} />
                    <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                      Status akun di atas belum berubah. Direktori baru mengikuti setelah
                      perubahan benar-benar dijalankan dan diverifikasi.
                    </p>
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs text-ink-muted">
                    Tidak ada pengajuan yang sedang berjalan untuk karyawan ini.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-8 space-y-2 border-t border-hairline pt-4">
              <Button
                variant="secondary"
                onClick={() => onOpenReportPDF?.(employee)}
                className="w-full justify-center"
                icon={<IconDownload />}
              >
                Cetak profil karyawan
              </Button>

              {canRequest && !pending ? (
                <div className="flex gap-2">
                  <Link
                    href={`/pengajuan/baru?type=MOVEMENT&employeeId=${employee.id}`}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-hairline-strong bg-elevated px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-accent/50"
                  >
                    <IconSwap className="size-4" />
                    Ajukan Movement
                  </Link>
                  <Link
                    href={`/pengajuan/baru?type=TERMINATION&employeeId=${employee.id}`}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/20"
                  >
                    <IconPower className="size-4" />
                    Ajukan Termination
                  </Link>
                </div>
              ) : null}

              <p className="text-[11px] leading-relaxed text-ink-faint">
                Perubahan akses selalu melewati persetujuan manager dan CISO. Tidak ada tombol di
                halaman ini yang mengubah akun secara langsung.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}
