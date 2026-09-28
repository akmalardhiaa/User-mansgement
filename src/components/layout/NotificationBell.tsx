"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { IconApprovals, IconBell, IconChevron } from "@/components/ui/Icons";
import { TRANSITION_FAST } from "@/lib/motion";

// ─── Types ────────────────────────────────────────────────────────────────────

type NotificationKind = "FAILED" | "WAITING_TOO_LONG" | "REJECTED" | "COMPLETED";

interface NotificationItem {
  id: string;
  kind: NotificationKind;
  type: "ONBOARDING" | "MOVEMENT" | "TERMINATION" | "PROFILE_UPDATE";
  subjectName: string;
  department: string;
  at: string;
  waitingHours?: number;
  stage?: "MANAGER" | "CISO";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  ONBOARDING: "Onboarding",
  MOVEMENT: "Mutasi",
  TERMINATION: "Offboarding",
  PROFILE_UPDATE: "Perubahan Profil",
};

/** The colour says how much it matters; the words say what happened. */
const KIND_STYLES: Record<NotificationKind, string> = {
  FAILED: "bg-danger/15 text-danger",
  WAITING_TOO_LONG: "bg-warn/15 text-warn",
  REJECTED: "bg-danger/10 text-danger",
  COMPLETED: "bg-accent/10 text-accent",
};

function describe(item: NotificationItem): string {
  switch (item.kind) {
    case "FAILED":
      return "Gagal dijalankan — akun belum berubah";
    case "WAITING_TOO_LONG": {
      const who = item.stage === "CISO" ? "tim CISO" : "manager";
      const days = Math.floor((item.waitingHours ?? 0) / 24);
      const waited = days >= 1 ? `${days} hari` : `${item.waitingHours ?? 0} jam`;
      return `Belum dijawab ${who} — ${waited}`;
    }
    case "REJECTED":
      return "Ditolak approver";
    case "COMPLETED":
      return "Selesai dijalankan";
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  const days = Math.floor(hrs / 24);
  return `${days} hari lalu`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [needsAttention, setNeedsAttention] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0); // trigger re-fetch
  const wrapRef = useRef<HTMLDivElement>(null);

  // Fetch notifications from the API
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items ?? []);
      setNeedsAttention(data.needsAttention ?? 0);
    } catch {
      // Silent failure — the bell simply shows no badge if unavailable.
    } finally {
      setLoading(false);
    }
  }, []);

  /*
   * Initial fetch plus one every 60 seconds, so the badge does not go stale
   * while somebody leaves the tab open. The first call is deferred to a
   * timeout rather than made in the effect body: React's lint rule for
   * effects is about exactly this shape, and a request that starts a tick
   * after paint is invisible to the person and keeps the rule honest.
   */
  useEffect(() => {
    const first = setTimeout(fetchNotifications, 0);
    const interval = setInterval(fetchNotifications, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [fetchNotifications, tick]);

  // Refresh immediately when the user opens the panel. The counter is bumped
  // outside the other setState: an updater must be pure, and one that also set
  // state ran twice in development and fetched twice with it.
  function toggleOpen() {
    if (!open) setTick((current) => current + 1);
    setOpen((prev) => !prev);
  }

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const count = items.length;

  return (
    <div ref={wrapRef} className="relative">
      {/* Bell button */}
      <button
        type="button"
        id="notification-bell"
        aria-label={
          needsAttention > 0
            ? `${needsAttention} pengajuan perlu diperhatikan`
            : "Notifikasi — tidak ada yang perlu diperhatikan"
        }
        aria-expanded={open}
        aria-haspopup="true"
        onClick={toggleOpen}
        className="relative rounded-lg p-2 text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
      >
        <IconBell className="size-4" />

        {/* Badge */}
        <AnimatePresence>
          {!loading && needsAttention > 0 ? (
            <motion.span
              key="badge"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={TRANSITION_FAST}
              className="absolute -right-0.5 -top-0.5 flex min-w-[1.1rem] items-center justify-center rounded-full bg-danger px-[3px] py-[1px] text-[9px] font-bold leading-none text-white"
            >
              {needsAttention > 9 ? "9+" : needsAttention}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={TRANSITION_FAST}
            className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-hairline-strong bg-surface shadow-[var(--shadow-panel)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Notifikasi</h2>
              {needsAttention > 0 ? (
                <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-semibold text-warn">
                  {needsAttention} perlu diperhatikan
                </span>
              ) : (
                <span className="text-[11px] text-ink-faint">Semua beres ✓</span>
              )}
            </div>

            {/* Body */}
            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="size-5 rounded-full border-2 border-accent/30 border-t-accent"
                  />
                </div>
              ) : count === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <span className="grid size-12 place-items-center rounded-full border border-hairline bg-elevated/60 text-ink-faint">
                    <IconApprovals className="size-5" />
                  </span>
                  <p className="text-sm text-ink-muted">
                    Tidak ada yang perlu diperhatikan.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-hairline/60">
                  {items.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/pengajuan/${item.id}`}
                        onClick={() => setOpen(false)}
                        className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-elevated"
                      >
                        {/* Type badge, coloured by what happened to it */}
                        <span
                          className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            KIND_STYLES[item.kind]
                          }`}
                        >
                          {TYPE_LABELS[item.type] ?? item.type}
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">
                            {item.subjectName}
                          </p>
                          {item.department ? (
                            <p className="truncate text-xs text-ink-muted">{item.department}</p>
                          ) : null}
                          <p className="mt-0.5 text-[11px] text-ink-faint">{describe(item)}</p>
                        </div>

                        <span className="shrink-0 text-[10px] text-ink-faint">
                          {timeAgo(item.at)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer — links to the full approvals list */}
            {count > 0 ? (
              <div className="border-t border-hairline px-4 py-2.5">
                <Link
                  href="/pengajuan"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-1 text-xs font-medium text-accent transition-opacity hover:opacity-80"
                >
                  Lihat semua pengajuan
                  <IconChevron className="-rotate-90 size-3" />
                </Link>
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
