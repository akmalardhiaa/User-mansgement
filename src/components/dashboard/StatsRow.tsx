"use client";

import { motion } from "framer-motion";

import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { IconApprovals, IconCheck, IconDirectory, IconPower } from "@/components/ui/Icons";
import {
  SHEEN,
  TRANSITION_LAYOUT,
  hoverLift,
  pressSettle,
  stagger,
  staggerItem,
} from "@/lib/motion";
import { usePointerGlow } from "@/lib/motion/usePointerGlow";
import type { StatusFilter } from "@/lib/dashboard/directory";
import type { Employee } from "@/lib/types";

/**
 * Headline counts across the roster — and the fastest way to filter it.
 *
 * Each card is a button: the numbers were the first thing anyone looked at and
 * the last thing they could act on, so seeing "3 dalam persetujuan" and wanting
 * to know *which* three meant going to the filter dropdown and reconstructing
 * the question by hand. Now the number is the filter.
 */

interface StatDefinition {
  key: StatusFilter;
  label: string;
  value: number;
  tone: string;
  ring: string;
  icon: typeof IconDirectory;
  caption: string;
}

export function StatsRow({
  employees,
  pendingCount,
  active = "ALL",
  onSelect,
}: {
  employees: Employee[];
  /**
   * How many people have a lifecycle request in flight. Passed in rather than
   * derived from the roster: it is a fact about requests, and the directory no
   * longer pretends to know it.
   */
  pendingCount: number;
  /** The status filter currently applied, so the matching card reads as pressed. */
  active?: StatusFilter;
  onSelect?: (status: StatusFilter) => void;
}) {
  // One set of handlers shared by all four tiles: each writes onto whichever
  // node the pointer is actually over, so there is nothing per-card to hold.
  const glow = usePointerGlow<HTMLButtonElement>();

  const count = (predicate: (employee: Employee) => boolean) => employees.filter(predicate).length;

  const stats: StatDefinition[] = [
    {
      key: "ALL",
      label: "Total karyawan",
      value: employees.length,
      tone: "text-ink",
      ring: "hover:border-hairline-strong",
      icon: IconDirectory,
      caption: "Seluruh direktori",
    },
    {
      key: "ACTIVE",
      label: "Aktif",
      value: count((employee) => employee.status === "ACTIVE"),
      tone: "text-ok",
      ring: "hover:border-ok/40",
      icon: IconCheck,
      caption: "Akses berjalan normal",
    },
    {
      key: "PENDING",
      label: "Ada pengajuan",
      value: pendingCount,
      tone: "text-warn",
      ring: "hover:border-warn/40",
      icon: IconApprovals,
      caption: "Perubahan yang belum dijalankan",
    },
    {
      key: "DISABLED",
      label: "Nonaktif",
      value: count((employee) => employee.status === "DISABLED"),
      tone: "text-ink-muted",
      ring: "hover:border-hairline-strong",
      icon: IconPower,
      caption: "Akun tidak berjalan",
    },
  ];

  return (
    <motion.div
      variants={stagger()}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      {stats.map((stat) => {
        const selected = active === stat.key;
        return (
          <motion.button
            key={stat.key}
            type="button"
            variants={staggerItem}
            // These are the four biggest targets on the page and until now the
            // only thing that answered the pointer was a border colour. The
            // guards matter: a disabled tile is not a control, so it should not
            // move under the cursor and invite a click that does nothing.
            whileHover={onSelect ? hoverLift : undefined}
            whileTap={onSelect ? pressSettle : undefined}
            // Only a live tile tracks the pointer. A glow chasing the cursor
            // across something that cannot be clicked is an invitation.
            {...(onSelect ? glow : null)}
            onClick={() => onSelect?.(selected && stat.key !== "ALL" ? "ALL" : stat.key)}
            // A toggle, not a link: it turns a filter on and off in place.
            aria-pressed={selected}
            disabled={!onSelect}
            className={`group relative overflow-hidden rounded-2xl border bg-surface/80 p-4 text-left backdrop-blur-sm transition-[border-color,background-color,box-shadow] duration-300 ease-(--ease-out-quint) disabled:cursor-default ${
              onSelect ? "pointer-glow" : ""
            } ${
              selected
                ? // The shadow is gold rather than black: the selected tile
                  // should look lit from within, not stacked on top of its
                  // neighbours. Spread far and faint enough that it reads as
                  // warmth around the card and never as an edge.
                  "border-accent/50 bg-surface shadow-[0_18px_44px_-30px_var(--color-accent)]"
                : `border-hairline ${stat.ring}`
            }`}
          >
            {/* Marks the pressed card without moving anything: a bar Framer
                slides between cards as the filter changes. Its own initial and
                animate stop it inheriting the parent's entrance variants, which
                would otherwise blur and drop a two-pixel rule into place. */}
            {selected ? (
              <motion.span
                layoutId="stat-active"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={TRANSITION_LAYOUT}
                className="absolute inset-x-0 top-0 h-0.5 bg-accent shadow-[0_0_12px_1px_var(--color-accent)]"
              />
            ) : null}

            {/*
              * A single band of light crossing the card the moment it becomes
              * the filter. Mounted with the selection, so it plays exactly once
              * per press and cannot be seen at rest — and the whole row is
              * covered, so the confirmation is legible to someone whose eyes
              * were on a different card when they clicked.
              */}
            {selected ? (
              <motion.span
                aria-hidden
                initial={{ x: "-170%" }}
                animate={{ x: "430%" }}
                transition={SHEEN}
                className="pointer-events-none absolute inset-y-0 left-0 w-1/4 -skew-x-12 bg-gradient-to-r from-transparent via-accent/25 to-transparent"
              />
            ) : null}

            <div className="flex items-start justify-between gap-2">
              <p className="text-xs tracking-wide text-ink-faint uppercase">{stat.label}</p>
              <stat.icon
                className={`size-4 shrink-0 transition-[color,scale] duration-300 ease-(--ease-out-quint) group-hover:scale-115 ${
                  selected ? "text-accent" : "text-ink-faint/60 group-hover:text-ink-faint"
                }`}
              />
            </div>

            <p className={`mt-2 text-3xl font-semibold ${stat.tone}`}>
              <AnimatedNumber value={stat.value} />
            </p>
            <p className="mt-1 text-[11px] text-ink-faint">{stat.caption}</p>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
