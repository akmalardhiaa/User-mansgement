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

    return () => {
      // Killing mid-flight leaves `shown` on the last painted figure, so an
      // interrupted count resumes from where the eye left it.
      shown.current = Math.round(counter.value);
      tween.kill();
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={`tnum ${className}`}>
      {value}
    </span>
  );
}
