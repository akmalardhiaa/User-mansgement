"use client";

import { m as motion } from "framer-motion";
import { useState } from "react";

import { OnboardingForm } from "@/components/lifecycle/OnboardingForm";
import { RequestSubmitted } from "@/components/lifecycle/RequestSubmitted";
import type { LifecycleRequest } from "@/lib/lifecycle/types";
import { TRANSITION } from "@/lib/motion";
import type { Employee } from "@/lib/types";

/**
 * Asking for a new account, and nothing else.
 *
 * This used to offer all three requests as a row of cards. It now offers one,
 * because Movement and Termination are things that happen to somebody who is
 * already in the directory — and the place you go to change somebody who is
 * already there is the page where you pick them from a list and see the record
 * you are changing. Both moved to Edit profil, whole, and this page kept the
 * one request that has no subject to pick: the person does not exist yet.
 *
 * `employees` is still needed. It is the roster the manager picker chooses
 * from, and a new hire's approving manager is somebody who already works here.
 */
export function NewRequestView({ employees }: { employees: Employee[] }) {
  const [submitted, setSubmitted] = useState<LifecycleRequest | null>(null);

  if (submitted) {
    return <RequestSubmitted request={submitted} onRaiseAnother={() => setSubmitted(null)} />;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={TRANSITION}>
      <OnboardingForm employees={employees} onSubmitted={setSubmitted} />
    </motion.div>
  );
}
