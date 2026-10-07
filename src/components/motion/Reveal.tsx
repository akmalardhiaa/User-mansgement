"use client";

import { m as motion, type Variants } from "framer-motion";
import { useMemo } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { TRANSITION } from "@/lib/motion";

interface RevealProps extends Omit<ComponentPropsWithoutRef<typeof motion.div>, "children"> {
  children: ReactNode;
  /** Seconds to wait before starting. Use to order sections down a page. */
  delay?: number;
  /**
   * Hold until the element is scrolled into view instead of animating on mount.
   * Only worth it below the fold — above it, a viewport check just delays paint.
   */
  whenVisible?: boolean;
}

/**
 * The standard entrance: rise, sharpen and fade. For page sections and panels.
 *
 * `opacity` and `transform` are the free half — the browser keeps those on the
 * compositor and never re-layouts mid-flight. The blur is not free, and is here
 * anyway: a section that resolves out of softness reads as arriving, where one
 * that only slides reads as having been shoved. It is affordable because a page
 * has a handful of these and each runs once.
 */
export function Reveal({ children, delay = 0, whenVisible = false, ...props }: RevealProps) {
  // Built here rather than imported: a variant carries its own transition, and
  // that beats the `transition` prop, so the delay has to go inside it.
  const variants = useMemo<Variants>(
    () => ({
      // Opacity and position only: both run on the compositor. The blur that
      // used to come with them re-rasterised the whole block on every frame.
      hidden: { opacity: 0, y: 10 },
      visible: { opacity: 1, y: 0, transition: { ...TRANSITION, delay } },
    }),
    [delay],
  );

  return (
    <motion.div
      initial="hidden"
      variants={variants}
      {...(whenVisible
        ? // `once` matters: re-animating on every scroll past turns a document
          // into a slideshow.
          { whileInView: "visible", viewport: { once: true, margin: "-80px" } }
        : { animate: "visible" })}
      {...props}
    >
      {children}
    </motion.div>
  );
}
