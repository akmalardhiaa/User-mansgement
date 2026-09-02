"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/Button";
import {
  IconArrowUp,
  IconClose,
  IconDownload,
  IconFilter,
  IconSearch,
  IconSort,
} from "@/components/ui/Icons";
import { employeeStatusLabel } from "@/components/ui/StatusBadge";
import {
  SORT_KEYS,
  SORT_LABELS,
  isDefaultFilters,
  type DirectoryFilters,
} from "@/lib/dashboard/directory";
import { TRANSITION_FAST } from "@/lib/motion";
import { EMPLOYEE_STATUSES, type EmployeeStatus } from "@/lib/types";

// `w-full` so a select fills the stacked wrapper on narrow screens; on `sm` and
// up the wrapper is `w-auto`, which shrink-wraps to the select's own width.
const SELECT_CLASSES =
  "w-full appearance-none rounded-lg border border-hairline-strong bg-canvas/60 py-2 pr-8 pl-8 " +
  "text-sm text-ink transition-colors duration-200 focus:border-accent focus:outline-none";

interface DirectoryToolbarProps {
  filters: DirectoryFilters;
  onChange: (next: Partial<DirectoryFilters>) => void;
  onReset: () => void;
  onExport: () => void;
  /** Departments actually present in the roster. */
  departments: string[];
  shown: number;
  total: number;
}

/**
 * Search, filter, sort and export for the directory.
 *
 * The table shipped with a search box and a status dropdown, which is enough to
 * answer "where is Rizky" and nothing else. Anyone asking "who in IT — Security
 * is waiting on an approval" or "who joined most recently" had to read the whole
 * table. Department and sort close that gap; export is here because the answer
 * is usually on its way into a spreadsheet anyway.
 */
export function DirectoryToolbar({
  filters,
  onChange,
  onReset,
  onExport,
  departments,
  shown,
  total,
}: DirectoryToolbarProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const dirty = !isDefaultFilters(filters);

  // "/" jumps to search, the convention every tool with a list in it uses.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      // Not while the user is typing somewhere else — a "/" in a form field
      // belongs in that field.
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      event.preventDefault();
      searchRef.current?.focus();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="border-b border-hairline p-4">
      {/*
       * One wrapping row rather than nested flex groups. Nesting a wrap inside a
       * row meant the controls broke onto a second line while the search box
       * still had space beside it — the sort control ended up under the search
       * field with a gap to its right.
       */}
      <div className="flex flex-wrap items-center gap-2">
        {/* A fixed width, not flex-1: letting the search box grow ate the space
            the sort control needed and pushed it onto a second line. */}
        <div className="relative w-full sm:w-60">
          <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
          <input
            ref={searchRef}
            type="search"
            value={filters.query}
            onChange={(event) => onChange({ query: event.target.value })}
            placeholder="Cari nama, email, jabatan…"
            aria-label="Cari karyawan"
            className="w-full rounded-lg border border-hairline-strong bg-canvas/60 py-2 pr-16 pl-9 text-sm placeholder:text-ink-faint focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          <AnimatePresence initial={false}>
            {filters.query ? (
              <motion.button
                key="clear"
                type="button"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={TRANSITION_FAST}
                onClick={() => {
                  onChange({ query: "" });
                  searchRef.current?.focus();
                }}
                aria-label="Hapus pencarian"
                className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-0.5 text-ink-faint transition-colors hover:text-ink"
              >
                <IconClose className="size-3.5" />
              </motion.button>
            ) : (
              // The hint hides once there is a query, where the clear button
              // needs the same corner.
              <motion.kbd
                key="hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={TRANSITION_FAST}
                className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-hairline-strong px-1.5 py-0.5 font-mono text-[10px] text-ink-faint sm:block"
              >
                /
              </motion.kbd>
            )}
          </AnimatePresence>
        </div>

        <div className="relative w-full sm:w-auto">
          <IconFilter className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-faint" />
          <select
            value={filters.status}
            onChange={(event) =>
              onChange({ status: event.target.value as DirectoryFilters["status"] })
            }
            aria-label="Saring berdasarkan status"
            className={SELECT_CLASSES}
          >
            <option value="ALL">Semua status</option>
            <option value="PENDING">Dalam persetujuan</option>
            {EMPLOYEE_STATUSES.map((status: EmployeeStatus) => (
              <option key={status} value={status}>
                {employeeStatusLabel(status)}
              </option>
            ))}
          </select>
          <SelectArrow />
        </div>

        <div className="relative w-full sm:w-auto">
          <IconFilter className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-faint" />
          <select
            value={filters.department}
            onChange={(event) => onChange({ department: event.target.value })}
            aria-label="Saring berdasarkan departemen"
            className={SELECT_CLASSES}
          >
            <option value="ALL">Semua departemen</option>
            {departments.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
          <SelectArrow />
        </div>

        {/* The direction toggle is welded to the sort select — they are one
            control, and a gap between them reads as two unrelated ones. */}
        <div className="flex w-full items-center sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <IconSort className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-faint" />
            <select
              value={filters.sort}
              onChange={(event) =>
                onChange({ sort: event.target.value as DirectoryFilters["sort"] })
              }
              aria-label="Urutkan berdasarkan"
              className={`${SELECT_CLASSES} rounded-r-none border-r-0`}
            >
              {SORT_KEYS.map((key) => (
                // The prefix stays in the label: without it the closed select
                // reads "Nama" beside "Semua departemen" and looks like a third
                // filter rather than the sort.
                <option key={key} value={key}>
                  Urut: {SORT_LABELS[key]}
                </option>
              ))}
            </select>
            <SelectArrow />
          </div>
          <button
            type="button"
            onClick={() => onChange({ direction: filters.direction === "asc" ? "desc" : "asc" })}
            aria-label={
              filters.direction === "asc"
                ? "Urutan menaik — klik untuk membalik"
                : "Urutan menurun — klik untuk membalik"
            }
            title={filters.direction === "asc" ? "Menaik (A→Z)" : "Menurun (Z→A)"}
            className="rounded-r-lg border border-hairline-strong px-2.5 py-2 text-ink-muted transition-colors hover:border-accent/50 hover:text-ink"
          >
            <motion.span
              animate={{ rotate: filters.direction === "asc" ? 0 : 180 }}
              transition={TRANSITION_FAST}
              className="block"
            >
              <IconArrowUp className="size-4" />
            </motion.span>
          </button>
        </div>

        <AnimatePresence initial={false}>
          {dirty ? (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={TRANSITION_FAST}
              className="overflow-hidden"
            >
              <Button variant="ghost" size="sm" onClick={onReset} icon={<IconClose />}>
                Reset
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs whitespace-nowrap text-ink-faint">
            <span className="tnum text-ink">{shown}</span> dari{" "}
            <span className="tnum">{total}</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onExport}
            disabled={shown === 0}
            icon={<IconDownload />}
            title="Unduh baris yang terlihat sebagai CSV"
          >
            Ekspor
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The custom chevron, since a native select's own arrow ignores the palette. */
function SelectArrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-ink-faint"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
