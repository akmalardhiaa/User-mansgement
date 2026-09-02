"use client";

import { motion, type Variants } from "framer-motion";
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
 * The standard entrance: rise and fade. Used for page sections and panels.
 *
 * Animating `opacity` and `transform` only, so the browser can keep the whole
 * thing on the compositor and never re-layouts mid-flight.
 */
export function Reveal({ children, delay = 0, whenVisible = false, ...props }: RevealProps) {
  // Built here rather than imported: a variant carries its own transition, and
  // that beats the `transition` prop, so the delay has to go inside it.
  const variants = useMemo<Variants>(
    () => ({
      hidden: { opacity: 0, y: 12 },
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
