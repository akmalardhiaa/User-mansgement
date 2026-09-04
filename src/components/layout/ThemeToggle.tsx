"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useSyncExternalStore } from "react";

import { IconMoon, IconSun } from "@/components/ui/Icons";
import { TRANSITION_FAST } from "@/lib/motion";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";

/**
 * Dark/light switch.
 *
 * The source of truth is the `data-theme` attribute the boot script already
 * wrote, not React state — so this reads the DOM through
 * `useSyncExternalStore` rather than keeping a second copy that would disagree
 * with the document on the very first render.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function setTheme(theme: Theme): void {
  applyTheme(theme);
  for (const listener of listeners) listener();
}

export function ThemeToggle() {
  // The server has no document, so it renders the dark default. The boot script
  // has already corrected the attribute by the time this hydrates, and the only
  // thing that could mismatch is which glyph shows — not the page's colours.
  const theme = useSyncExternalStore(subscribe, readTheme, () => "dark" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={next === "light" ? "Beralih ke mode terang" : "Beralih ke mode gelap"}
      title={next === "light" ? "Mode terang" : "Mode gelap"}
      className="grid size-8 place-items-center overflow-hidden rounded-lg border border-hairline text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink"
    >
      {/* The glyph turns rather than swaps: sun and moon are the same idea seen
          from two sides, and a cut between them reads as a different button.
          `initial={false}` so the icon does not spin on first paint. */}
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={theme}
          initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
          transition={TRANSITION_FAST}
          className="grid place-items-center"
        >
          {theme === "dark" ? <IconSun className="size-4" /> : <IconMoon className="size-4" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
