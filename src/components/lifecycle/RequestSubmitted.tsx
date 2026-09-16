"use client";

import { motion } from "framer-motion";
import Link from "next/link";

import { LifecycleStatusBadge } from "@/components/lifecycle/LifecycleStatusBadge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Field";
import { IconCheck, IconUserCheck } from "@/components/ui/Icons";
import { TRANSITION } from "@/lib/motion";
import type { LifecycleRequest } from "@/lib/lifecycle/types";

/**
 * What happened after a request was sent.
 *
 * It names both approvers, because those came back from the server and are the
 * answer to the question HC actually has: who now has to act. And it says
 * plainly that nothing has changed yet — the most important sentence on the
 * screen, since the previous version of this app told people an account was
 * ready the moment a form was submitted.
 */
export function RequestSubmitted({
  request,
  onRaiseAnother,
}: {
  request: LifecycleRequest;
  onRaiseAnother: () => void;
}) {
  const manager = request.approvals.find((step) => step.stage === "MANAGER")?.approver;
  const ciso = request.approvals.find((step) => step.stage === "CISO")?.approver;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={TRANSITION}>
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <motion.span
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.1 }}
            className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-ok/30 bg-ok/10 text-ok"
          >
            <IconCheck className="size-4" />
          </motion.span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink">Pengajuan terkirim</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Pengajuan untuk <strong className="text-ink">{request.subject.displayName}</strong>{" "}
              sudah dikunci dan diteruskan ke approver pertama.
            </p>
          </div>
          <div className="ml-auto shrink-0">
            <LifecycleStatusBadge status={request.status} />
          </div>
        </div>

        <div className="mt-5 space-y-2.5 rounded-xl border border-hairline bg-elevated/40 p-4">
          <p className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
            Yang harus menyetujui
          </p>
          {[
            ["1. Manager", manager],
            ["2. CISO", ciso],
          ].map(([label, approver]) => (
            <div key={label as string} className="flex items-center gap-2.5 text-sm">
              <IconUserCheck className="size-4 shrink-0 text-accent" />
              <span className="text-xs text-ink-faint">{label as string}</span>
              <span className="ml-auto min-w-0 truncate text-right">
                <span className="block font-medium text-ink">
                  {typeof approver === "object" && approver ? approver.name : "—"}
                </span>
                <span className="block font-mono text-[11px] text-ink-muted">
                  {typeof approver === "object" && approver ? approver.email : ""}
                </span>
              </span>
            </div>
          ))}
        </div>

        <p className="mt-4 rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-xs leading-relaxed text-warn">
          Belum ada yang berubah pada akun. Direktori tetap menampilkan keadaan sekarang sampai
          kedua approval masuk dan perubahannya benar-benar dijalankan.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/pengajuan/${request.id}`} className={buttonClasses()}>
            Lihat pengajuan
          </Link>
          <Button variant="secondary" onClick={onRaiseAnother}>
            Buat pengajuan lain
          </Button>
          <Link
            href="/pengajuan"
            className="self-center text-sm text-ink-muted transition-colors hover:text-ink"
          >
            Daftar pengajuan
          </Link>
        </div>
      </Card>
    </motion.div>
  );
}
