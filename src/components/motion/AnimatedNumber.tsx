"use client";

import { animate } from "framer-motion";
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
 * A figure that counts up to its value.
 *
 * The real number is in the server-rendered markup, so anyone without
 * JavaScript — and anything reading the page as a document — sees the figure
 * itself rather than a zero waiting for a tween. The animation only takes over
 * after mount, and writes straight to the DOM node instead of through React
 * state, which keeps sixty frames a second out of the reconciler entirely.
 *
 * This used to be driven by GSAP. It is Framer Motion's imperative `animate`
 * now, and the reason is weight rather than taste: GSAP was a second animation
 * runtime — 68.5 KB in the client bundle, confirmed by inspecting the built
 * chunks — earning its place on this file and three orbs on the login screen.
 * Framer was already there for everything else.
 *
 * Reduced motion needs no check here. MotionProvider sets `reducedMotion="user"`
 * for the whole app, so Framer drops the transform below on its own — where the
 * old code had to ask `matchMedia` by hand and remember to.
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

    const from = shown.current;

    const counter = animate(from, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        node.textContent = String(Math.round(latest));
        shown.current = latest;
      },
      onComplete: () => {
        shown.current = value;
      },
    });

    /*
     * Anchored on the left edge: these sit at the top of a left-aligned column,
     * and scaling from the middle would slide the first digit sideways and back
     * for no reason.
     *
     * Set as a style rather than passed as an animation option, because it is
     * one — `AnimationOptions` has no `transformOrigin` key, and putting it
     * there knocks the DOM overload out of the running entirely. TypeScript
     * then falls back to the plain-object overload and reports `scale` as
     * invalid on an HTMLSpanElement, which points at the symptom rather than
     * the cause. The value never changes, so a single assignment is the whole
     * of it.
     */
    node.style.transformOrigin = "left center";

    /*
     * A swell as the count starts, so a number that changes because of
     * something the user just did says so. It overshoots and settles, which is
     * the difference between a figure that reacted and one that was replaced.
     */
    const pop = settled.current
      ? animate(node, { scale: [1.16, 1] }, { duration: 0.55, ease: [0.34, 1.56, 0.64, 1] })
      : null;
    settled.current = true;

    return () => {
      // Stopping mid-flight leaves `shown` on the last painted figure, so an
      // interrupted count resumes from where the eye left it.
      counter.stop();
      // Without clearing the transform, an interrupted pop leaves the figure
      // stranded at whatever scale it had reached.
      pop?.stop();
      node.style.transform = "";
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
