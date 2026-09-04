/**
 * Theme selection, shared between the inline boot script and the toggle.
 *
 * The stored value is only ever "dark" or "light" — a stored "system" would
 * have to be re-resolved on every read, and the OS preference is already the
 * fallback when nothing is stored at all.
 */

export type Theme = "dark" | "light";

export const THEME_KEY = "hc:theme";

/** The attribute the stylesheet keys off, always written explicitly. */
export const THEME_ATTR = "data-theme";

/**
 * Runs before the first paint, inlined into <head> as a string.
 *
 * It has to be inline and synchronous: React cannot help here, because any
 * theme applied after hydration means a flash of the wrong palette on every
 * load. Written as a plain string rather than a bundled module for the same
 * reason — a module is a network round trip, and this must beat the paint.
 *
 * Deliberately silent on failure. If localStorage throws, the document keeps
 * the dark default rather than the page failing to render.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{
var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});
if(t!=="dark"&&t!=="light"){t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}
document.documentElement.setAttribute(${JSON.stringify(THEME_ATTR)},t);
}catch(e){document.documentElement.setAttribute(${JSON.stringify(THEME_ATTR)},"dark");}})();`;

export function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute(THEME_ATTR) === "light" ? "light" : "dark";
}

function commit(theme: Theme): void {
  document.documentElement.setAttribute(THEME_ATTR, theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // The choice simply will not survive a reload.
  }
}

/**
 * Swaps the theme, crossfading the page where the browser can.
 *
 * Every colour on screen changes at once, and snapping the lot is the one
 * moment in this app where a transition is doing real work rather than
 * decorating. Framer cannot help: these are CSS custom properties on <html>,
 * not component state. The View Transitions API can, by snapshotting the old
 * frame and fading it out over the new one — and where it is missing, the
 * assignment simply happens, which is exactly the behaviour without it.
 *
 * Skipped outright for "reduce motion". A full-page crossfade is precisely the
 * kind of thing that setting is asking not to see.
 */
export function applyTheme(theme: Theme): void {
  const startViewTransition = (
    document as Document & { startViewTransition?: (cb: () => void) => unknown }
  ).startViewTransition;

  if (!startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    commit(theme);
    return;
  }

  startViewTransition.call(document, () => commit(theme));
}
