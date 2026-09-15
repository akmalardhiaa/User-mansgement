"use client";

import { useCallback, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Makes a surface answer the pointer with a highlight that follows it.
 *
 * Spread the returned handlers onto any element carrying the `pointer-glow`
 * class; the gradient itself lives in globals.css and reads the two custom
 * properties written here.
 *
 * Nothing about this goes through React. The position is written straight onto
 * the node with `setProperty`, so a pointer crossing a card produces sixty
 * style writes a second and zero renders — the same figure through `useState`
 * would re-render the dashboard on every frame of every hover.
 *
 * The element's box is measured once on entry rather than on each move: reading
 * `getBoundingClientRect` forces the browser to settle pending layout before it
 * can answer, and doing that inside a pointermove handler is how a smooth hover
 * turns into a stuttering one. A card cannot move while the pointer is inside
 * it without the pointer leaving first, so one measurement is the whole truth.
 */
export function usePointerGlow<T extends HTMLElement>() {
  const box = useRef<DOMRect | null>(null);

  const onPointerEnter = useCallback((event: ReactPointerEvent<T>) => {
    box.current = event.currentTarget.getBoundingClientRect();
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<T>) => {
    // The fallback covers a pointer that arrives without an enter — a card
    // appearing under a cursor that was already there, which is exactly what a
    // filter change does.
    const rect = box.current ?? event.currentTarget.getBoundingClientRect();
    const style = event.currentTarget.style;
    style.setProperty("--glow-x", `${event.clientX - rect.left}px`);
    style.setProperty("--glow-y", `${event.clientY - rect.top}px`);
  }, []);

  return { onPointerEnter, onPointerMove };
}
