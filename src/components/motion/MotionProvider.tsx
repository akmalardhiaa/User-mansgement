"use client";

import { LazyMotion, MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/**
 * The animation engine arrives after the page, not with it.
 *
 * Every animated component imports `m` (as `motion`), the light shell, and
 * this provider loads the features they need in a separate chunk once the page
 * is on screen. Importing the full `motion` put the whole engine — about 44 KB
 * compressed — in front of the first paint of every page. `strict` makes a
 * stray full `motion` import an error rather than a silent return of that
 * weight.
 *
 * Inside it, every animation honours the OS "reduce motion" setting.
 * `reducedMotion="user"` keeps opacity and colour changes — which carry meaning,
 * such as a row confirming it saved — while dropping transforms, which are the
 * part that actually makes people ill. Setting it once here means no individual
 * component has to remember.
 */
const loadFeatures = () => import("./motionFeatures").then((module) => module.default);

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
