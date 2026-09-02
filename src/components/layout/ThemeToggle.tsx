"use client";

import { useSyncExternalStore } from "react";

import { IconMoon, IconSun } from "@/components/ui/Icons";
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
      className="grid size-8 place-items-center rounded-lg border border-hairline text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink"
    >
      {theme === "dark" ? <IconSun className="size-4" /> : <IconMoon className="size-4" />}
    </button>
  );
}
