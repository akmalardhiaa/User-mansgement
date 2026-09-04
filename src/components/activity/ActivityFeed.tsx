"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Field";
import {
  IconAlert,
  IconCheck,
  IconClock,
  IconDownload,
  IconPower,
  IconSearch,
  IconSwap,
  IconUserPlus,
} from "@/components/ui/Icons";
import { stagger, staggerItem } from "@/lib/motion";
import { ACTIVITY_ACTIONS, type ActivityAction, type ActivityEntry } from "@/lib/types";

/**
 * Who did what, and when.
 *
 * Grouped by day rather than listed flat: the question this answers is almost
 * always "what happened on the day X went wrong", and a thousand rows in one
 * column cannot be scanned for a date.
 */

const ACTION_PRESENTATION: Record<
  ActivityAction,
  { label: string; tone: string; icon: typeof IconClock }
> = {
  "user.created": {
    label: "Akun diajukan",
    tone: "border-info/30 bg-info/10 text-info",
    icon: IconUserPlus,
  },
  "transfer.requested": {
    label: "Pindah divisi diajukan",
    tone: "border-info/30 bg-info/10 text-info",
    icon: IconSwap,
  },
  "access.disabled": {
    label: "Akses ditangguhkan",
    tone: "border-danger/30 bg-danger/10 text-danger",
    icon: IconPower,
  },
  "access.enabled": {
    label: "Akses diaktifkan",
    tone: "border-ok/30 bg-ok/10 text-ok",
    icon: IconPower,
  },
  "request.approved": {
    label: "Disetujui manager",
    tone: "border-ok/30 bg-ok/10 text-ok",
    icon: IconCheck,
  },
  "request.rejected": {
    label: "Ditolak manager",
    tone: "border-danger/30 bg-danger/10 text-danger",
    icon: IconAlert,
  },
  "request.completed": {
    label: "Penyiapan selesai",
    tone: "border-ok/30 bg-ok/10 text-ok",
    icon: IconCheck,
  },
  "directory.exported": {
    label: "Direktori diekspor",
    tone: "border-hairline-strong bg-elevated text-ink-muted",
    icon: IconDownload,
  },
};

const DAY = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

const CLOCK = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

/**
 * Grouping key, not a label. Derived from the Jakarta calendar date rather than
 * the ISO string, so an entry at 07:00 WIB does not land on the previous day
 * because UTC had not turned over yet.
 */
function dayKey(iso: string): string {
  return DAY.format(new Date(iso));
}

export function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<ActivityAction | "ALL">("ALL");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (action !== "ALL" && entry.action !== action) return false;
      if (!needle) return true;
      return [entry.actor, entry.employeeName ?? "", entry.detail]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [entries, query, action]);

  const days = useMemo(() => {
    const grouped = new Map<string, ActivityEntry[]>();
    for (const entry of visible) {
      const key = dayKey(entry.at);
      const bucket = grouped.get(key);
      if (bucket) bucket.push(entry);
      else grouped.set(key, [entry]);
    }
    return [...grouped.entries()];
  }, [visible]);

  const filtering = query.trim() !== "" || action !== "ALL";

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-hairline p-4 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari nama, pelaku, atau keterangan"
          aria-label="Cari aktivitas"
          className="w-full rounded-lg border border-hairline-strong bg-canvas/60 px-3 py-2 text-sm placeholder:text-ink-faint focus:border-accent focus:outline-none sm:max-w-xs"
        />
        <select
          value={action}
          onChange={(event) => setAction(event.target.value as ActivityAction | "ALL")}
          aria-label="Saring berdasarkan jenis aktivitas"
          className="rounded-lg border border-hairline-strong bg-canvas/60 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
        >
          <option value="ALL">Semua aktivitas</option>
          {ACTIVITY_ACTIONS.map((value) => (
            <option key={value} value={value}>
              {ACTION_PRESENTATION[value].label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-3 text-xs text-ink-faint sm:ml-auto">
          {filtering ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setAction("ALL");
              }}
            >
              Reset
            </Button>
          ) : null}
          <span aria-live="polite">
            {visible.length} dari {entries.length}
          </span>
        </div>
      </div>

      {days.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full border border-hairline bg-elevated/60 text-ink-faint">
            <IconSearch className="size-5" />
          </span>
          <p className="mt-3 text-sm text-ink-muted">
            {entries.length === 0
              ? "Belum ada aktivitas yang tercatat."
              : "Tidak ada aktivitas yang cocok dengan saringan ini."}
          </p>
        </div>
      ) : (
        <motion.div variants={stagger(0.03)} initial="hidden" animate="visible">
          {days.map(([day, dayEntries]) => (
            <section key={day}>
              {/* Sticky so the date stays visible while a long day scrolls past. */}
              <h2 className="sticky top-[4.5rem] z-10 border-y border-hairline bg-surface/95 px-4 py-2 text-xs font-medium tracking-wide text-ink-faint uppercase backdrop-blur-sm">
                {day}
              </h2>
              <ul>
                {dayEntries.map((entry) => {
                  const style = ACTION_PRESENTATION[entry.action];
                  return (
                    <motion.li
                      key={entry.id}
                      variants={staggerItem}
                      className="flex gap-3 border-b border-hairline/60 px-4 py-3 last:border-0"
                    >
                      <time
                        dateTime={entry.at}
                        className="mt-0.5 w-11 shrink-0 font-mono text-xs text-ink-faint tnum"
                      >
                        {CLOCK.format(new Date(entry.at))}
                      </time>
                      <span
                        className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border ${style.tone}`}
                        aria-hidden
                      >
                        <style.icon className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug text-ink">{entry.detail}</p>
                        <p className="mt-0.5 text-xs text-ink-faint">
                          {style.label} · oleh {entry.actor}
                        </p>
                      </div>
                    </motion.li>
                  );
                })}
              </ul>
            </section>
          ))}
        </motion.div>
      )}
    </Card>
  );
}
