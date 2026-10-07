"use client";

import { AnimatePresence, m as motion } from "framer-motion";
import React, { useEffect, useRef, useState, type ReactNode, type SelectHTMLAttributes } from "react";

import { CONTROL_CLASSES, FieldShell, LeadingIcon, describedBy } from "@/components/ui/Field";
import { IconCheck, IconChevron } from "@/components/ui/Icons";
import { optionsFrom } from "@/components/ui/selectOptions";
import { TRANSITION_FAST } from "@/lib/motion";

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string;
  name?: string;
  error?: string;
  hint?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}

export function SelectField({
  label,
  name,
  value,
  defaultValue,
  onChange,
  icon,
  error,
  hint,
  children,
  className = "",
  "aria-label": ariaLabel,
  ...props
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());

  // The options come from the same `<option>` children a native select takes,
  // so a caller reads like a select and can be swapped back to one. The reading
  // itself is in selectOptions.ts, where it can be tested without a browser.
  const options = optionsFrom(children);

  /*
   * Only read while uncontrolled. A controlled caller's `value` is used
   * directly below rather than copied into state and synchronised back with an
   * effect: the copy was always one render behind, and keeping both meant two
   * sources of truth for the same answer.
   */
  const [internalValue, setInternalValue] = useState(
    value !== undefined ? value.toString() : (defaultValue?.toString() ?? "")
  );

  const currentValue = value !== undefined ? value.toString() : internalValue;
  const selected = options.find((opt) => opt.value === currentValue);
  const activeValue = options[active]?.value;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Keyed on the highlighted option's value, not the options array: the array
  // is rebuilt from `children` on every render, so depending on it ran this
  // after every keystroke in the form around it.
  useEffect(() => {
    if (!open || activeValue === undefined) return;
    optionRefs.current.get(activeValue)?.scrollIntoView({ block: "nearest" });
  }, [activeValue, open]);

  function choose(option: { value: string; label: string }) {
    if (value === undefined) {
      setInternalValue(option.value);
    }
    setOpen(false);
    if (onChange) {
      // Mock the event object for native onChange compatibility
      const event = {
        target: { value: option.value, name: name ?? "" },
        currentTarget: { value: option.value, name: name ?? "" },
      } as React.ChangeEvent<HTMLSelectElement>;
      onChange(event);
    }
  }

  /**
   * Opens the list with the current value highlighted, so the first arrow key
   * moves from there rather than from the top.
   *
   * Its own function because the keyboard path used to call `setOpen(true)`
   * directly and skip the highlighting: ArrowDown then Enter therefore picked
   * the SECOND option in the list rather than the next one after the current
   * value, silently, for anybody not using a mouse.
   */
  function openList() {
    const chosen = options.findIndex((option) => option.value === currentValue);
    setActive(chosen >= 0 ? chosen : 0);
    setOpen(true);
  }

  function toggleList() {
    if (open) setOpen(false);
    else openList();
  }

  function onKeyDown(event: React.KeyboardEvent) {
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
      if (options.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + options.length) % options.length);
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && !open) {
      event.preventDefault();
      openList();
      return;
    }

    if (event.key === "Enter" && open && options[active]) {
      event.preventDefault();
      choose(options[active]);
    }
  }

  const listId = `${name ?? "select"}-listbox`;

  const buttonElement = (
    <button
      type="button"
      id={name}
      role="combobox"
      aria-expanded={open}
      aria-controls={listId}
      aria-haspopup="listbox"
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(name ?? "", error, hint)}
      aria-label={ariaLabel}
      onClick={toggleList}
      onKeyDown={onKeyDown}
      className={`${CONTROL_CLASSES} flex items-center gap-2 pr-9 text-left ${
        icon ? "pl-9" : ""
      } ${error ? "border-danger/60" : ""} ${
        !label ? "w-full" : ""
      }`}
      /*
       * Whatever the caller passed beyond the props named above. The type says
       * select attributes because the component stands in for a select; a
       * handful of them (`multiple`, `size`) mean nothing on a button, and none
       * of the callers here pass one.
       */
      {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      <span className={`min-w-0 flex-1 truncate ${selected && selected.value !== "" ? "text-ink" : "text-ink-faint"}`}>
        {selected ? selected.label : "Pilih…"}
      </span>
      <IconChevron
        className={`absolute right-3 size-4 shrink-0 text-ink-faint transition-transform duration-200 ${
          open ? "rotate-180" : ""
        }`}
      />
    </button>
  );

  const dropdownElement = (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={TRANSITION_FAST}
          className="absolute top-full right-0 left-0 z-20 mt-1.5 max-h-72 overflow-y-auto rounded-lg border border-hairline-strong bg-surface shadow-[var(--shadow-panel)]"
        >
          <ul id={listId} role="listbox" aria-label={label ?? ariaLabel} className="py-1">
            {options.map((option, index) => {
              const highlighted = index === active;
              const chosen = option.value === currentValue;

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
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {chosen ? <IconCheck className="size-3.5 shrink-0" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  if (label) {
    return (
      <div ref={wrap} className={className}>
        <FieldShell label={label} name={name ?? ""} error={error} hint={hint}>
          {icon ? <LeadingIcon>{icon}</LeadingIcon> : null}
          {name && <input type="hidden" name={name} value={currentValue} />}
          {buttonElement}
          {dropdownElement}
        </FieldShell>
      </div>
    );
  }

  return (
    <div ref={wrap} className={`relative group ${className}`}>
      {icon ? <LeadingIcon>{icon}</LeadingIcon> : null}
      {name && <input type="hidden" name={name} value={currentValue} />}
      {buttonElement}
      {dropdownElement}
    </div>
  );
}
