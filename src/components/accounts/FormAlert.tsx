"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

import { IconAlert, IconCheck } from "@/components/ui/Icons";
import { TRANSITION_FAST } from "@/lib/motion";

/**
 * The banner every account form uses for its one whole-form message.
 *
 * Per-field problems belong beside their field — `Field` already renders those
 * — so this is only for what has no field to attach to: a wrong password, an
 * expired link, a confirmation that mail is on its way. Keeping the two
 * separate is what stops a form showing the same complaint twice.
 */
export function FormAlert({
  tone,
  children,
}: {
  tone: "error" | "success" | "info";
  children: ReactNode;
}) {
  const styles = {
    error: "border-danger/30 bg-danger/10 text-danger",
    success: "border-ok/30 bg-ok/10 text-ok",
    info: "border-info/30 bg-info/10 text-info",
  }[tone];

  const Icon = tone === "error" ? IconAlert : IconCheck;

  return (
    <AnimatePresence initial={false}>
      {children ? (
        <motion.div
          // `role="alert"` so a screen reader announces the outcome without the
          // person having to go looking for what changed.
          role="alert"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={TRANSITION_FAST}
          className="overflow-hidden"
        >
          <div className={`flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm ${styles}`}>
            <Icon className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 space-y-1">{children}</div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
