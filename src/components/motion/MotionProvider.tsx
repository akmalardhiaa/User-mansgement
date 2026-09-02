"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Wraps the app so every Framer Motion animation inside it honours the OS
 * "reduce motion" setting.
 *
 * `reducedMotion="user"` keeps opacity and colour changes — which carry meaning,
 * such as a row confirming it saved — while dropping transforms, which are the
 * part that actually makes people ill. Setting it once here means no individual
 * component has to remember.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
