"use client";

import { motion } from "framer-motion";
import { useState } from "react";

import { MovementForm } from "@/components/lifecycle/MovementForm";
import { OnboardingForm } from "@/components/lifecycle/OnboardingForm";
import { RequestSubmitted } from "@/components/lifecycle/RequestSubmitted";
import { TerminationForm } from "@/components/lifecycle/TerminationForm";
import { IconPower, IconSwap, IconUserPlus } from "@/components/ui/Icons";
import { TRANSITION, stagger, staggerItem } from "@/lib/motion";
import type { LifecycleRequest, LifecycleType } from "@/lib/lifecycle/types";
import type { Employee } from "@/lib/types";

const CHOICES: ReadonlyArray<{
  type: LifecycleType;
  label: string;
  description: string;
  icon: typeof IconUserPlus;
}> = [
  {
    type: "ONBOARDING",
    label: "Onboarding",
    description: "Karyawan baru yang belum punya akun.",
    icon: IconUserPlus,
  },
  {
    type: "MOVEMENT",
    label: "Movement",
    description: "Pindah divisi, jabatan, atau manager.",
    icon: IconSwap,
  },
  {
    type: "TERMINATION",
    label: "Termination",
    description: "Menonaktifkan akun karyawan yang keluar.",
    icon: IconPower,
  },
];

/**
 * Picking which of the three requests to raise, then raising it.
 *
 * The roster handed to Movement and Termination has already had anyone with a
 * request in flight removed. The server refuses a second active request for the
 * same person anyway — that rule belongs there, not here — but offering a name
 * the submit will reject is a worse way to explain the rule than not offering it.
 */
export function NewRequestView({
  employees,
  selectableEmployees,
  initialType,
  initialEmployeeId,
}: {
  /** Everyone, for the manager pickers. */
  employees: Employee[];
  /** Only those without a request in flight, for the subject pickers. */
  selectableEmployees: Employee[];
  initialType?: LifecycleType;
  initialEmployeeId?: string;
}) {
  const [type, setType] = useState<LifecycleType>(initialType ?? "ONBOARDING");
  const [submitted, setSubmitted] = useState<LifecycleRequest | null>(null);

  if (submitted) {
    return <RequestSubmitted request={submitted} onRaiseAnother={() => setSubmitted(null)} />;
  }

  return (
    <div className="space-y-6">
      <motion.div
        variants={stagger(0.05)}
        initial="hidden"
        animate="visible"
        className="grid gap-3 sm:grid-cols-3"
        role="tablist"
        aria-label="Jenis pengajuan"
      >
        {CHOICES.map((choice) => {
          const selected = type === choice.type;
          return (
            <motion.button
              key={choice.type}
              variants={staggerItem}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setType(choice.type)}
              className={`group rounded-2xl border p-4 text-left backdrop-blur-sm transition-[border-color,background-color,box-shadow] duration-300 ease-(--ease-out-quint) ${
                selected
                  ? "border-accent/50 bg-surface shadow-[0_18px_44px_-30px_var(--color-accent)]"
                  : "border-hairline bg-surface/80 hover:border-hairline-strong"
              }`}
            >
              <choice.icon
                className={`size-5 transition-colors ${selected ? "text-accent" : "text-ink-faint"}`}
              />
              <p className="mt-2.5 text-sm font-semibold text-ink">{choice.label}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{choice.description}</p>
            </motion.button>
          );
        })}
      </motion.div>

      <motion.div
        key={type}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={TRANSITION}
      >
        {type === "ONBOARDING" ? (
          <OnboardingForm employees={employees} onSubmitted={setSubmitted} />
        ) : null}
        {type === "MOVEMENT" ? (
          <MovementForm
            employees={selectableEmployees}
            initialEmployeeId={initialEmployeeId}
            onSubmitted={setSubmitted}
          />
        ) : null}
        {type === "TERMINATION" ? (
          <TerminationForm
            employees={selectableEmployees}
            initialEmployeeId={initialEmployeeId}
            onSubmitted={setSubmitted}
          />
        ) : null}
      </motion.div>
    </div>
  );
}
