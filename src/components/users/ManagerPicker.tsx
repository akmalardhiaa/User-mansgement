"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

import { Field, SelectField } from "@/components/ui/Field";
import { IconCheck, IconAlert, IconMail, IconUserCheck } from "@/components/ui/Icons";
import { collapse } from "@/lib/motion";
import type { Employee } from "@/lib/types";

/**
 * Who approves this request.
 *
 * Whatever address ends up here is where the approval email goes, so this is
 * the one field on the form that decides whether anybody hears about the
 * request at all. It is checked with the same rule the server applies, and the
 * verdict names the actual address — "will be sent to x@y" is something HC can
 * read back and catch a typo in; a generic "ready" is not.
 *
 * Only the format can be checked here. Whether the mailbox exists is known only
 * once the mail is sent, and a failed send rolls the request back rather than
 * leaving it waiting on someone who was never told.
 */

export interface ManagerValue {
  managerName: string;
  managerEmail: string;
}

/** Same rule as src/lib/validation/userInput.ts, so the two never disagree. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Check = { state: "idle" } | { state: "valid"; email: string } | { state: "invalid" };

const MANUAL = "__manual__";

function checkAddress(email: string): Check {
  const trimmed = email.trim();
  if (!trimmed) return { state: "idle" };
  return EMAIL_PATTERN.test(trimmed) ? { state: "valid", email: trimmed } : { state: "invalid" };
}

export function ManagerPicker({
  employees,
  value,
  onChange,
  nameError,
  emailError,
}: {
  /** The roster to choose from; the signed-in officer's own record included. */
  employees: Employee[];
  value: ManagerValue;
  onChange: (next: ManagerValue) => void;
  nameError?: string;
  emailError?: string;
}) {
  /*
   * Manual mode is inferred rather than stored: a value that matches nobody on
   * the roster can only have been typed. That keeps the mode correct when the
   * form is rehydrated from a draft or a duplicated employee, with no extra
   * state to get out of step with the value.
   */
  const matched = employees.find((employee) => employee.email === value.managerEmail);
  const [manual, setManual] = useState(() => Boolean(value.managerEmail) && !matched);
  const [check, setCheck] = useState<Check>({ state: "idle" });

  // Judged once the address settles rather than per keystroke, so a half-typed
  // address does not flash as invalid while HC is still typing it.
  useEffect(() => {
    const timer = setTimeout(() => setCheck(checkAddress(value.managerEmail)), 400);
    return () => clearTimeout(timer);
  }, [value.managerEmail]);

  function selectEmployee(email: string) {
    if (email === MANUAL) {
      setManual(true);
      onChange({ managerName: "", managerEmail: "" });
      return;
    }
    setManual(false);
    const employee = employees.find((candidate) => candidate.email === email);
    onChange({
      managerName: employee?.displayName ?? "",
      managerEmail: employee?.email ?? "",
    });
  }

  return (
    <div className="space-y-4">
      <SelectField
        label="Manager"
        name="managerSelect"
        icon={<IconUserCheck />}
        value={manual ? MANUAL : (matched?.email ?? "")}
        onChange={(event) => selectEmployee(event.target.value)}
        error={manual ? undefined : nameError}
        hint={manual ? undefined : "Atasan langsung karyawan ini."}
      >
        <option value="">Pilih manager…</option>
        {employees.map((employee) => (
          <option key={employee.id} value={employee.email}>
            {employee.displayName} · {employee.department}
          </option>
        ))}
        <option value={MANUAL}>+ Manager belum ada di daftar…</option>
      </SelectField>

      <AnimatePresence initial={false}>
        {manual ? (
          <motion.div
            variants={collapse}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="overflow-hidden"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Nama manager"
                name="managerName"
                icon={<IconUserCheck />}
                value={value.managerName}
                onChange={(event) => onChange({ ...value, managerName: event.target.value })}
                placeholder="Dimas Anggara"
                error={nameError}
              />
              <Field
                label="Email manager"
                name="managerEmail"
                type="email"
                icon={<IconMail />}
                value={value.managerEmail}
                onChange={(event) => onChange({ ...value, managerEmail: event.target.value })}
                placeholder="dimas.anggara@example.com"
                error={emailError}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {check.state !== "idle" && value.managerEmail ? (
          <motion.p
            variants={collapse}
            initial="hidden"
            animate="visible"
            exit="exit"
            // Polite, not assertive: this updates while HC is still typing, and
            // an assertive region would interrupt them on every keystroke.
            aria-live="polite"
            className="overflow-hidden text-xs"
          >
            {check.state === "valid" ? (
              <span className="flex items-center gap-1.5 pt-0.5 text-ok">
                <IconCheck className="size-3.5 shrink-0" />
                <span>
                  Email manager: <span className="font-mono break-all">{check.email}</span>
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 pt-0.5 text-warn">
                <IconAlert className="size-3.5 shrink-0" />
                Format email belum valid.
              </span>
            )}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
