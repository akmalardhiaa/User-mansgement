import type { Transition, Variants } from "framer-motion";

/**
 * One motion vocabulary for the whole dashboard.
 *
 * Every animation in the app pulls its curve and duration from here rather than
 * inventing its own, so a card arriving, a row expanding and a nav pill sliding
 * all read as the same piece of software. The numbers are deliberately short:
 * this is a tool people use all day, and motion that is enjoyable once is
 * irritating on the two-hundredth visit.
 *
 * The mirror of these values lives in globals.css (`--ease-out-quint`), which is
 * what plain CSS transitions use.
 */

/** Quintic ease-out — fast departure, long settle. The house curve. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Symmetric curve for things that move rather than arrive (nav pill, tabs). */
export const EASE_IN_OUT = [0.76, 0, 0.24, 1] as const;

/** Entrances and exits. */
export const TRANSITION: Transition = { duration: 0.4, ease: EASE_OUT };

/** Anything the user is waiting on mid-gesture: hovers, presses, toggles. */
export const TRANSITION_FAST: Transition = { duration: 0.2, ease: EASE_OUT };

/**
 * Layout changes — a row expanding, the nav pill travelling. Spring rather than
 * duration, because a layout shift has a distance and should look like it.
 */
export const TRANSITION_LAYOUT: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 38,
  mass: 0.9,
};

/** Rise-and-fade. The default entrance for a panel or a section. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: TRANSITION },
  exit: { opacity: 0, y: -8, transition: TRANSITION_FAST },
};

/** Plain fade, for content that would look unsettled if it also moved. */
export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: TRANSITION },
  exit: { opacity: 0, transition: TRANSITION_FAST },
};

/**
 * Parent of a list. Children inherit `hidden`/`visible` and are dealt out in
 * sequence — 45ms apart, quick enough that a twelve-row table finishes well
 * inside half a second.
 */
export function stagger(step = 0.045, delay = 0): Variants {
  return {
    hidden: {},
    visible: {
      transition: { staggerChildren: step, delayChildren: delay },
    },
  };
}

/** A single item inside a `stagger` parent. */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: TRANSITION },
};

/**
 * Height animation for a disclosure. `height: auto` is not animatable in CSS,
 * but Framer measures it, so the panel opens to whatever it actually needs.
 */
export const collapse: Variants = {
  hidden: { height: 0, opacity: 0 },
  visible: {
    height: "auto",
    opacity: 1,
    transition: { height: TRANSITION_LAYOUT, opacity: { duration: 0.2, delay: 0.06 } },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { height: TRANSITION_LAYOUT, opacity: { duration: 0.12 } },
  },
};
