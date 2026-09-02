"use client";

import { motion } from "framer-motion";

import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { IconApprovals, IconCheck, IconDirectory, IconPower } from "@/components/ui/Icons";
import { TRANSITION_LAYOUT, stagger, staggerItem } from "@/lib/motion";
import { isPending, type StatusFilter } from "@/lib/dashboard/directory";
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
  active = "ALL",
  onSelect,
}: {
  employees: Employee[];
  /** The status filter currently applied, so the matching card reads as pressed. */
  active?: StatusFilter;
  onSelect?: (status: StatusFilter) => void;
}) {
  const count = (predicate: (employee: Employee) => boolean) => employees.filter(predicate).length;

  const pending = count((employee) => isPending(employee.status));

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
      /*
       * Counts transfers too. It previously totted up only the two onboarding
       * statuses, so an employee waiting on a manager to approve their move
       * between divisions was invisible here — the one number whose whole job is
       * to say what is waiting.
       */
      key: "PENDING",
      label: "Dalam persetujuan",
      value: pending,
      tone: "text-warn",
      ring: "hover:border-warn/40",
      icon: IconApprovals,
      caption: "Akun baru dan pindah divisi",
    },
    {
      key: "DISABLED",
      label: "Dinonaktifkan",
      value: count((employee) => employee.status === "DISABLED"),
      tone: "text-ink-muted",
      ring: "hover:border-hairline-strong",
      icon: IconPower,
      caption: "Akses ditangguhkan",
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
            onClick={() => onSelect?.(selected && stat.key !== "ALL" ? "ALL" : stat.key)}
            // A toggle, not a link: it turns a filter on and off in place.
            aria-pressed={selected}
            disabled={!onSelect}
            className={`group relative overflow-hidden rounded-2xl border bg-surface/80 p-4 text-left backdrop-blur-sm transition-colors duration-200 disabled:cursor-default ${
              selected ? "border-accent/50 bg-surface" : `border-hairline ${stat.ring}`
            }`}
          >
            {/* Marks the pressed card without moving anything: a bar Framer
                slides between cards as the filter changes. */}
            {selected ? (
              <motion.span
                layoutId="stat-active"
                transition={TRANSITION_LAYOUT}
                className="absolute inset-x-0 top-0 h-0.5 bg-accent"
              />
            ) : null}

            <div className="flex items-start justify-between gap-2">
              <p className="text-xs tracking-wide text-ink-faint uppercase">{stat.label}</p>
              <stat.icon
                className={`size-4 shrink-0 transition-colors duration-200 ${
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
