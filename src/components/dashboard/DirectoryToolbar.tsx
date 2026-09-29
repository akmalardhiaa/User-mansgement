"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef } from "react";

import { useT } from "@/components/i18n/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { ChoiceField, type ChoiceGroup } from "@/components/ui/ChoiceField";

import {
  IconArrowUp,
  IconBuilding,
  IconClose,
  IconDownload,
  IconFilter,
  IconSearch,
  IconSort,
} from "@/components/ui/Icons";
import {
  SORT_KEYS,
  isDefaultFilters,
  type DirectoryFilters,
} from "@/lib/dashboard/directory";
import { DEPARTMENT_GROUPS } from "@/lib/db/seed";
import { sortLabel } from "@/lib/i18n/labels";
import { TRANSITION_FAST } from "@/lib/motion";
import { EMPLOYEE_STATUSES, type EmployeeStatus } from "@/lib/types";

interface DirectoryToolbarProps {
  filters: DirectoryFilters;
  onChange: (next: Partial<DirectoryFilters>) => void;
  onReset: () => void;
  onExport: () => void;
  /** Building the workbook is a round trip, so the button says so. */
  exporting?: boolean;
  /** Departments actually present in the roster. */
  departments: string[];
  shown: number;
  total: number;
  /** Disabled accounts the default view is leaving out, if any. */
  hiddenInactive?: number;
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
  exporting = false,
  departments,
  shown,
  total,
  hiddenInactive = 0,
}: DirectoryToolbarProps) {
  const t = useT();
  const searchRef = useRef<HTMLInputElement>(null);
  const dirty = !isDefaultFilters(filters);
  const departmentGroups = useMemo<ChoiceGroup[]>(() => {
    const available = new Set(departments);
    const catalogued = new Set<string>();

    const groups = DEPARTMENT_GROUPS.map((group) => {
      const items = group.items
        .filter((department) => available.has(department))
        .map((department) => {
          catalogued.add(department);
          return { value: department, label: department };
        });

      return { label: group.label, items };
    }).filter((group) => group.items.length > 0);

    // A roster can contain a legacy or newly-created division before the
    // catalogue catches up. It must stay filterable rather than disappearing
    // just because it has not yet been given a heading.
    const otherDepartments = departments
      .filter((department) => !catalogued.has(department))
      .map((department) => ({ value: department, label: department }));

    return [
      { items: [{ value: "ALL", label: t.directory.allDepartments }] },
      ...groups,
      ...(otherDepartments.length ? [{ label: t.directory.otherDepartment, items: otherDepartments }] : []),
    ];
  }, [departments, t]);

  /** The status options, in the same shape the two pickers beside it take. */
  const statusGroups = useMemo<ChoiceGroup[]>(
    () => [
      {
        items: [
          { value: "ALL", label: t.directory.allStatus },
          { value: "PENDING", label: t.directory.inApproval },
          ...EMPLOYEE_STATUSES.map((status: EmployeeStatus) => ({
            value: status,
            label: status === "ACTIVE" ? t.directory.statusActive : t.directory.statusDisabled,
          })),
        ],
      },
    ],
    [t],
  );

  /*
   * The sort options as the same shape the department picker takes. The prefix
   * stays in each label: without it the closed control reads "Nama" beside
   * "Semua departemen" and looks like a third filter rather than the sort.
   */
  const sortGroups = useMemo<ChoiceGroup[]>(
    () => [
      {
        items: SORT_KEYS.map((key) => ({
          value: key,
          label: `${t.directory.sortPrefix}: ${sortLabel(t, key)}`,
        })),
      },
    ],
    [t],
  );

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
    <div className="space-y-2 border-b border-hairline p-3">
      {/*
       * Two deliberate rows: the controls, then what the controls did.
       *
       * It was one wrapping row, which is why it looked the way it did — the
       * count and the export button were pushed right by `ml-auto` and wrapped
       * onto a line of their own anyway, leaving the sort control stranded
       * beside a gap. Saying where the break goes costs nothing and the row
       * stops rearranging itself at every width.
       */}
      <div className="flex flex-wrap items-center gap-2">
        {/* The search field takes the slack, so the row has no ragged end. */}
        <div className="relative w-full min-w-0 flex-1 sm:basis-56">
          <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
          <input
            ref={searchRef}
            type="search"
            value={filters.query}
            onChange={(event) => onChange({ query: event.target.value })}
            placeholder={t.directory.searchPlaceholder}
            aria-label={t.directory.searchLabel}
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
                aria-label={t.directory.clearSearch}
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

        {/* The same control as the two beside it. It was the one native select
            left in the row, and it was the one control that looked wrong. */}
        <ChoiceField
          label={t.directory.filterStatus}
          name="directory-status"
          value={filters.status}
          onChange={(status) => onChange({ status: status as DirectoryFilters["status"] })}
          groups={statusGroups}
          icon={<IconFilter className="size-3.5" />}
          className="w-full shrink-0 sm:w-44 [&>label]:sr-only"
        />

        <ChoiceField
          label={t.directory.filterDepartment}
          name="directory-department"
          value={filters.department}
          onChange={(department) => onChange({ department })}
          groups={departmentGroups}
          placeholder={t.directory.allDepartments}
          icon={<IconBuilding className="size-3.5" />}
          className="w-full shrink-0 sm:w-56 [&>label]:sr-only"
        />

        {/*
         * Same control as the department filter beside it, for the same reason
         * it reads as one row: three pickers built two different ways look like
         * two kinds of thing. The direction toggle stays welded to its right —
         * a gap between them reads as two unrelated controls.
         */}
        <div className="flex w-full shrink-0 items-center sm:w-auto">
          <div className="min-w-0 flex-1 sm:flex-none">
            <ChoiceField
              label={t.directory.sortBy}
              name="directory-sort"
              value={filters.sort}
              onChange={(sort) => onChange({ sort: sort as DirectoryFilters["sort"] })}
              groups={sortGroups}
              icon={<IconSort className="size-3.5" />}
              className="w-full sm:w-60 [&>label]:sr-only [&_[role=combobox]]:rounded-r-none [&_[role=combobox]]:border-r-0"
            />
          </div>
          <button
            type="button"
            onClick={() => onChange({ direction: filters.direction === "asc" ? "desc" : "asc" })}
            aria-label={
              filters.direction === "asc"
                ? t.directory.ascending
                : t.directory.descending
            }
            title={filters.direction === "asc" ? t.directory.ascendingShort : t.directory.descendingShort}
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
              className="shrink-0 overflow-hidden"
            >
              <Button variant="ghost" size="sm" onClick={onReset} icon={<IconClose />}>
                Reset
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* What the row above did, and the one action that acts on it. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs whitespace-nowrap text-ink-faint">
          <span className="tnum text-ink">{shown}</span> {t.directory.countOf}{" "}
          <span className="tnum">{total}</span>
        </span>
        {/* Said out loud, because a roster quietly missing half its rows reads
            as data loss rather than as a default. */}
        {hiddenInactive > 0 ? (
          <span
            title={t.directory.hiddenInactiveHint}
            className="cursor-help text-xs whitespace-nowrap text-ink-faint underline decoration-dotted decoration-ink-faint/50 underline-offset-2"
          >
            {t.directory.hiddenInactive.replace("{count}", String(hiddenInactive))}
          </span>
        ) : null}
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={onExport}
            disabled={shown === 0 || exporting}
            loading={exporting}
            icon={<IconDownload />}
            title={t.directory.exportHint}
          >
            {t.directory.export}
          </Button>
        </div>
      </div>
    </div>
  );
}
