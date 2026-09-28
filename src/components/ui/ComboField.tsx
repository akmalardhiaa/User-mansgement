"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { CONTROL_CLASSES, FieldShell, LeadingIcon, describedBy } from "@/components/ui/Field";
import { IconCheck, IconChevron } from "@/components/ui/Icons";
import type { CatalogueGroup } from "@/lib/db/seed";
import { TRANSITION_FAST } from "@/lib/motion";

/**
 * A catalogue field: suggestions you can pick, and a value you can still type.
 *
 * This replaces `<datalist>`, and the reason is not taste. A datalist popup is
 * drawn by the browser and cannot be styled at all — not the type, not the
 * spacing, not the colours, and least of all the group headings. Forty-seven job
 * titles arrived as one flat wall in whatever the browser felt like, while the
 * grouping that would have made them skimmable existed only as comments in the
 * source, visible to nobody.
 *
 * What it must NOT become is a `<select>`. The whole reason these two fields are
 * not dropdowns is that a closed list refuses a division or a title that
 * genuinely exists but nobody has added to the catalogue yet — and a form that
 * refuses the truth is a form people route around. So free text stays, and the
 * empty state says so out loud instead of looking like a dead end.
 */
/**
 * The part of an option that matched what was typed, marked.
 *
 * With seven headings and a filter, the eye needs somewhere to land: seeing
 * WHY a row survived the filter is faster than re-reading the row. Only the
 * first occurrence is marked — a second mark on the same line reads as two
 * separate results.
 */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, at)}
      <span className="rounded-sm bg-accent/20 text-ink">{text.slice(at, at + query.length)}</span>
      {text.slice(at + query.length)}
    </>
  );
}

export function ComboField({
  label,
  name,
  value,
  onChange,
  groups,
  icon,
  error,
  hint,
  placeholder,
  className = "",
}: {
  label: string;
  name: string;
  value: string;
  onChange: (next: string) => void;
  groups: readonly CatalogueGroup[];
  icon?: ReactNode;
  error?: string;
  hint?: ReactNode;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  /** Each rendered option, so the highlighted one can be scrolled into view. */
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());

  /** Groups with their non-matching entries removed, and empty groups dropped. */
  const filtered = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return groups;
    return groups
      .map((group) => ({
        label: group.label,
        items: group.items.filter((item) => item.toLowerCase().includes(query)),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, value]);

  /** The same options in one sequence, so an arrow key can cross a heading. */
  const flat = useMemo(() => filtered.flatMap((group) => group.items), [filtered]);

  /*
   * Whatever was highlighted is meaningless once the list changes under it, so
   * the highlight returns to the top rather than to a stale row.
   *
   * Adjusted during render rather than in an effect. An effect would commit the
   * stale highlight and then correct it — a second render for a frame nobody
   * should ever see, which is exactly what `react-hooks/set-state-in-effect`
   * exists to catch. Setting state during render is React's documented answer
   * for deriving state from a changed input: it re-runs this component before
   * anything reaches the DOM.
   */
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setActive(0);
  }

  /*
   * Closed by an outside press rather than by blur. Blur fires before the click
   * that caused it lands, so closing on blur takes the panel away from under the
   * option somebody was in the middle of choosing.
   */
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  /*
   * Keep the highlighted row on screen.
   *
   * The panel scrolls, so without this the arrow keys walk the highlight out of
   * view and the list stops responding to the eye after about eight rows — the
   * selection is moving, just nowhere anybody can see. `block: "nearest"` scrolls
   * the minimum needed, so a row already visible does not jump to the middle.
   */
  useEffect(() => {
    if (!open) return;
    const item = flat[active];
    if (item) optionRefs.current.get(item)?.scrollIntoView({ block: "nearest" });
  }, [active, open, flat]);

  function choose(item: string) {
    onChange(item);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (flat.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + flat.length) % flat.length);
      return;
    }

    if (event.key === "Enter" && open && flat[active]) {
      // Only while a suggestion is highlighted. Otherwise Enter belongs to the
      // form, because typing something the catalogue has never heard of is
      // allowed and must not be hijacked.
      event.preventDefault();
      choose(flat[active]);
    }
  }

  const listId = `${name}-listbox`;
  const typed = value.trim();
  const exact = flat.some((item) => item.toLowerCase() === typed.toLowerCase());

  return (
    <div ref={wrap}>
      <FieldShell label={label} name={name} error={error} hint={hint} className={className}>
        {icon ? <LeadingIcon>{icon}</LeadingIcon> : null}

        <input
          id={name}
          name={name}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(name, error, hint)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={`${CONTROL_CLASSES} pr-9 ${icon ? "pl-9" : ""} ${
            error ? "border-danger/60" : ""
          }`}
        />

        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? "Tutup daftar" : "Buka daftar"}
          onClick={() => setOpen((current) => !current)}
          className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded text-ink-faint transition-colors hover:text-ink"
        >
          <IconChevron
            className={`size-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>

        <AnimatePresence>
          {open ? (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={TRANSITION_FAST}
              className="absolute top-full right-0 left-0 z-20 mt-1.5 max-h-64 overflow-y-auto rounded-lg border border-hairline-strong bg-surface shadow-[var(--shadow-panel)]"
            >
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-xs leading-relaxed text-ink-muted">
                  Tidak ada yang cocok dengan{" "}
                  <span className="font-medium text-ink">{typed}</span>. Isian ini tidak dibatasi
                  daftar — teruskan mengetik untuk memakai nilai Anda sendiri.
                </p>
              ) : (
                <ul id={listId} role="listbox" aria-label={label} className="py-1">
                  {filtered.map((group) => (
                    <li key={group.label} role="presentation">
                      {/*
                        * Sticky, because the panel scrolls. A heading that
                        * scrolls away leaves you reading a list of titles with
                        * no idea which group you have arrived in — which is the
                        * one thing the grouping was for. The background is
                        * opaque so rows do not show through it on the way past.
                        */}
                      <p className="sticky top-0 z-10 bg-surface px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-ink-faint uppercase">
                        {group.label}
                      </p>
                      <ul role="presentation">
                        {group.items.map((item) => {
                          const index = flat.indexOf(item);
                          const highlighted = index === active;
                          const chosen = item === value;

                          return (
                            <li key={item} role="presentation">
                              <button
                                type="button"
                                role="option"
                                aria-selected={chosen}
                                ref={(node) => {
                                  if (node) optionRefs.current.set(item, node);
                                  else optionRefs.current.delete(item);
                                }}
                                // The pointer moves the highlight too, so the
                                // keyboard and the mouse never disagree about
                                // which row Enter would take.
                                onMouseEnter={() => setActive(index)}
                                onClick={() => choose(item)}
                                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                                  highlighted ? "bg-elevated text-ink" : "text-ink-muted"
                                } ${chosen ? "font-semibold text-accent" : ""}`}
                              >
                                <span className="min-w-0 flex-1 truncate">
                                  <Highlight text={item} query={typed} />
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

              {/*
               * Said once, at the foot of the panel, where it reads as
               * reassurance rather than as an error: the list is a shortcut and
               * never a gate.
               */}
              {filtered.length > 0 && typed && !exact ? (
                <p className="sticky bottom-0 border-t border-hairline bg-surface px-3 py-2 text-[11px] text-ink-faint">
                  {flat.length} cocok. Tidak ada yang pas? Nilai yang Anda ketik tetap dipakai.
                </p>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </FieldShell>
    </div>
  );
}
