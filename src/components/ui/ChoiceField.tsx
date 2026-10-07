"use client";

import { AnimatePresence, m as motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { useT } from "@/components/i18n/LocaleProvider";
import { CONTROL_CLASSES, FieldShell, LeadingIcon, describedBy } from "@/components/ui/Field";
import { IconCheck, IconChevron, IconSearch } from "@/components/ui/Icons";
import { TRANSITION_FAST } from "@/lib/motion";

/**
 * A choice from a fixed set, in the same panel as ComboField.
 *
 * The two look alike on purpose and differ where it matters. In ComboField what
 * you type IS the value, because a division or a job title that the catalogue
 * has never heard of still has to be enterable. Here the value must be one of
 * the options — you cannot raise a Movement for a person who does not exist —
 * so typing only filters, and the field falls back to the selected label the
 * moment the panel closes.
 *
 * A native `<select>` would be the obvious alternative and is the thing this
 * replaces: its dropdown is drawn by the browser and cannot be styled at all,
 * so a roster of twenty people arrived as an unsearchable, ungrouped list in
 * whatever the operating system felt like.
 *
 * The search box appears only once there is enough to search. Below the
 * threshold it would be a box to tab past on the way to two options, which is
 * how a control meant to speed things up starts costing a click.
 */

export interface ChoiceOption {
  value: string;
  label: string;
  /** Secondary text, shown muted after the label. A division, a description. */
  meta?: string;
}

export interface ChoiceGroup {
  /** Omitted for a flat list; rendered as a sticky heading when present. */
  label?: string;
  items: readonly ChoiceOption[];
}

/** Below this many options a search box costs more than it saves. */
const SEARCH_THRESHOLD = 8;

export function ChoiceField({
  label,
  name,
  value,
  onChange,
  groups,
  placeholder,
  icon,
  error,
  hint,
  searchable,
  className = "",
}: {
  label: string;
  name: string;
  value: string;
  onChange: (next: string) => void;
  groups: readonly ChoiceGroup[];
  placeholder?: string;
  icon?: ReactNode;
  error?: string;
  hint?: ReactNode;
  /** Defaults to on once the list passes SEARCH_THRESHOLD. */
  searchable?: boolean;
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());

  const all = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const withSearch = searchable ?? all.length > SEARCH_THRESHOLD;
  const selected = all.find((option) => option.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((group) => ({
        label: group.label,
        items: group.items.filter(
          (option) =>
            option.label.toLowerCase().includes(q) || option.meta?.toLowerCase().includes(q),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  const flat = useMemo(() => filtered.flatMap((group) => group.items), [filtered]);

  // The highlight means nothing once the list changes under it. Adjusted during
  // render rather than in an effect, which would commit the stale row first.
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setActive(0);
  }

  /* Closed by an outside press, not by blur: blur fires before the click that
   * caused it lands, taking the panel away from under the option being chosen. */
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  /* Opening starts the search where the eye already is. `openList` clears the
   * query at the interaction that opens the panel, before this effect runs. */
  useEffect(() => {
    if (open && withSearch) search.current?.focus();
  }, [open, withSearch]);

  /* Keep the highlighted row on screen; the panel scrolls. */
  useEffect(() => {
    if (!open) return;
    const option = flat[active];
    if (option) optionRefs.current.get(option.value)?.scrollIntoView({ block: "nearest" });
  }, [active, open, flat]);

  function choose(option: ChoiceOption) {
    onChange(option.value);
    setOpen(false);
  }

  function openList() {
    // Each visit starts with the complete catalogue. Keeping a prior search
    // would make the panel look incomplete when opened again.
    setQuery("");
    setOpen(true);
  }

  function toggleList() {
    if (open) setOpen(false);
    else openList();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      if (flat.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + flat.length) % flat.length);
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && !open) {
      event.preventDefault();
      openList();
      return;
    }

    if (event.key === "Enter" && open && flat[active]) {
      event.preventDefault();
      choose(flat[active]);
    }
  }

  const listId = `${name}-listbox`;

  return (
    <div ref={wrap}>
      <FieldShell label={label} name={name} error={error} hint={hint} className={className}>
        {icon ? <LeadingIcon>{icon}</LeadingIcon> : null}

        <button
          type="button"
          id={name}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(name, error, hint)}
          onClick={toggleList}
          onKeyDown={onKeyDown}
          className={`${CONTROL_CLASSES} flex items-center gap-2 pr-9 text-left ${
            icon ? "pl-9" : ""
          } ${error ? "border-danger/60" : ""}`}
        >
          <span className={`min-w-0 flex-1 truncate ${selected ? "text-ink" : "text-ink-faint"}`}>
            {selected ? selected.label : (placeholder ?? t.actions.choosePlaceholder)}
            {selected?.meta ? <span className="text-ink-faint"> · {selected.meta}</span> : null}
          </span>
          <IconChevron
            className={`absolute right-3 size-4 shrink-0 text-ink-faint transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>

        <AnimatePresence>
          {open ? (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={TRANSITION_FAST}
              className="absolute top-full right-0 left-0 z-20 mt-1.5 max-h-72 overflow-y-auto rounded-lg border border-hairline-strong bg-surface shadow-[var(--shadow-panel)]"
            >
              {withSearch ? (
                <div className="sticky top-0 z-20 border-b border-hairline bg-surface p-2">
                  <div className="relative">
                    <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-faint" />
                    <input
                      ref={search}
                      type="text"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={onKeyDown}
                      placeholder={t.actions.searchPlaceholder}
                      aria-label={`Cari ${label.toLowerCase()}`}
                      className="w-full rounded-md border border-hairline bg-canvas/60 py-1.5 pr-2 pl-8 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>
              ) : null}

              {flat.length === 0 ? (
                <p className="px-3 py-3 text-xs text-ink-muted">
                  Tidak ada yang cocok dengan{" "}
                  <span className="font-medium text-ink">{query.trim()}</span>.
                </p>
              ) : (
                <ul id={listId} role="listbox" aria-label={label} className="py-1">
                  {filtered.map((group, groupIndex) => (
                    <li key={group.label ?? groupIndex} role="presentation">
                      {group.label ? (
                        <p className="sticky top-0 z-10 bg-surface px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-ink-faint uppercase">
                          {group.label}
                        </p>
                      ) : null}
                      <ul role="presentation">
                        {group.items.map((option) => {
                          const index = flat.indexOf(option);
                          const highlighted = index === active;
                          const chosen = option.value === value;

                          return (
                            <li key={option.value} role="presentation">
                              <button
                                type="button"
                                role="option"
                                aria-selected={chosen}
                                ref={(node) => {
                                  if (node) optionRefs.current.set(option.value, node);
                                  else optionRefs.current.delete(option.value);
                                }}
                                onMouseEnter={() => setActive(index)}
                                onClick={() => choose(option)}
                                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                                  highlighted ? "bg-elevated text-ink" : "text-ink-muted"
                                } ${chosen ? "font-semibold text-accent" : ""}`}
                              >
                                <span className="min-w-0 flex-1 truncate">
                                  {option.label}
                                  {option.meta ? (
                                    <span className="text-ink-faint"> · {option.meta}</span>
                                  ) : null}
                                </span>
                                {chosen ? <IconCheck className="size-3.5 shrink-0" /> : null}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </FieldShell>
    </div>
  );
}
