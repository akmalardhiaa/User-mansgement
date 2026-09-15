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

/*
 * Springs, not durations.
 *
 * A fixed duration moves everything at the same rate no matter how far it has
 * to travel, which is what reads as mechanical: the motion is correct and
 * lifeless at once. A spring is described by how long it looks like it takes
 * (`visualDuration`) and how much it overshoots on the way in (`bounce`), and
 * settles according to distance on its own.
 *
 * The bounce values are small on purpose. This is a tool people use all day, so
 * the aim is motion that feels alive rather than motion anyone notices twice —
 * enough give that things arrive rather than snap, well short of playful.
 */

/** Entrances and exits. */
export const TRANSITION: Transition = { type: "spring", visualDuration: 0.34, bounce: 0.24 };

/** Anything the user is waiting on mid-gesture: hovers, presses, toggles. */
export const TRANSITION_FAST: Transition = { type: "spring", visualDuration: 0.18, bounce: 0.14 };

/**
 * Layout changes — the nav pill travelling, a toast pushing its neighbours
 * along. Carries the most bounce of the three: these have a real distance to
 * cover, and it is the one place a little overshoot reads as weight.
 */
export const TRANSITION_LAYOUT: Transition = {
  type: "spring",
  visualDuration: 0.4,
  bounce: 0.3,
};

/**
 * Height specifically. Overshooting a height means the content below is pushed
 * past where it lands and pulled back, which reads as a glitch rather than as
 * give — so a disclosure gets the spring's timing with almost none of its
 * bounce.
 */
export const TRANSITION_HEIGHT: Transition = {
  type: "spring",
  visualDuration: 0.34,
  bounce: 0.05,
};

/**
 * Rise, sharpen and fade in. The default entrance for a panel or a section.
 *
 * The blur is what separates this from a slide. A panel that only moves has
 * always been there and is being repositioned; a panel that resolves out of
 * softness is being brought into being, which is what actually just happened.
 * Six pixels is enough to read as depth of field and short of anything anyone
 * would call an effect.
 *
 * It is the one property here the compositor cannot do for free, so it is spent
 * only on entrances — never on a hover, and never on a table row, where a
 * hundred of them would land on one frame.
 */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12, filter: "blur(6px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: TRANSITION },
  exit: { opacity: 0, y: -8, filter: "blur(4px)", transition: TRANSITION_FAST },
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

/**
 * A single item inside a `stagger` parent. The touch of scale is what separates
 * arriving from sliding: at 0.985 nobody can name it, but the row reads as
 * coming toward the reader rather than being pushed up from below.
 */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.985, filter: "blur(5px)" },
  visible: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: TRANSITION },
};

/**
 * Pointer feedback for anything that is itself a control — a stat tile, a card
 * that opens. Lift on hover, settle under the press. Kept here rather than
 * written per component so every surface answers the pointer the same way.
 *
 * `whileTap` is deliberately smaller than the lift it replaces: a press should
 * look like the surface taking weight, not like it flinching.
 */
export const hoverLift = { y: -4, scale: 1.012, transition: TRANSITION_FAST };
export const pressSettle = { y: -1, scale: 0.985, transition: TRANSITION_FAST };

/**
 * A band of light crossing a surface once, left to right.
 *
 * Spent on the moment a card becomes the selected one. A border colour says
 * "this is now the filter" only to someone already looking at that card; a
 * sweep says it to whoever was looking anywhere on the row. One pass, no loop —
 * repeated, it would be a loading state.
 *
 * A tween rather than a spring, because a spring overshoots and this is a
 * travelling highlight: it has a direction, not a destination.
 */
export const SHEEN: Transition = { duration: 0.85, ease: [...EASE_OUT] };

/**
 * Height animation for a disclosure. `height: auto` is not animatable in CSS,
 * but Framer measures it, so the panel opens to whatever it actually needs.
 */
export const collapse: Variants = {
  hidden: { height: 0, opacity: 0 },
  visible: {
    height: "auto",
    opacity: 1,
    transition: { height: TRANSITION_HEIGHT, opacity: { duration: 0.2, delay: 0.06 } },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { height: TRANSITION_HEIGHT, opacity: { duration: 0.12 } },
  },
};
