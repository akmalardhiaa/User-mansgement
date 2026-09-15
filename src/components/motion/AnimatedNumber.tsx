"use client";

import gsap from "gsap";
import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * `useLayoutEffect` is what stops the counter flashing its final value: it runs
 * before the browser paints, so the element is already showing the start of the
 * tween on the first frame. React warns if it is called while server-rendering,
 * where there is no paint to be ahead of, so fall back there.
 */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

interface AnimatedNumberProps {
  value: number;
  className?: string;
  /** Tween length in seconds. */
  duration?: number;
}

/**
 * A figure that counts up to its value, driven by GSAP.
 *
 * The real number is in the server-rendered markup, so anyone without
 * JavaScript — and anything reading the page as a document — sees the figure
 * itself rather than a zero waiting for a tween. GSAP only takes over after
 * mount, and writes straight to the DOM node instead of through React state,
 * which keeps sixty frames a second out of the reconciler entirely.
 */
export function AnimatedNumber({ value, className = "", duration = 0.9 }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  // Where the last tween finished, so a value that changes while the user is
  // looking counts on from the figure on screen rather than restarting at zero.
  const shown = useRef(0);
  // False until the first count-up has run. That first pass is an entrance and
  // already has the eye; every pass after it is a figure moving under someone
  // who was reading it, which is the one worth marking.
  const settled = useRef(false);

  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.textContent = String(value);
      shown.current = value;
      return;
    }

    const counter = { value: shown.current };
    const tween = gsap.to(counter, {
      value,
      duration,
      ease: "power2.out",
      onUpdate: () => {
        node.textContent = String(Math.round(counter.value));
      },
      onComplete: () => {
        shown.current = value;
      },
    });

    /*
     * A swell as the count starts, so a number that changes because of
     * something the user just did says so. `back.out` overshoots and settles,
     * which is the difference between a figure that reacted and one that was
     * replaced.
     *
     * Anchored on the left edge: these sit at the top of a left-aligned column,
     * and scaling from the middle would slide the first digit sideways and back
     * for no reason.
     */
    const pop = settled.current
      ? gsap.fromTo(
          node,
          { scale: 1.16 },
          { scale: 1, duration: 0.55, ease: "back.out(2.4)", transformOrigin: "left center" },
        )
      : null;
    settled.current = true;

    return () => {
      // Killing mid-flight leaves `shown` on the last painted figure, so an
      // interrupted count resumes from where the eye left it.
      shown.current = Math.round(counter.value);
      tween.kill();
      // Without clearing the transform, an interrupted pop leaves the figure
      // stranded at whatever scale it had reached.
      pop?.kill();
      gsap.set(node, { clearProps: "transform" });
    };
  }, [value, duration]);

  return (
    // `inline-block` is load-bearing: an inline box ignores a transform, so
    // without it the pop above would silently do nothing.
    <span ref={ref} className={`tnum inline-block ${className}`}>
      {value}
    </span>
  );
}
