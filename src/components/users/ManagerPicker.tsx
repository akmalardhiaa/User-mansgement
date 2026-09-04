"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

import { Field, SelectField } from "@/components/ui/Field";
import { IconCheck, IconAlert, IconMail, IconUserCheck } from "@/components/ui/Icons";
import { collapse } from "@/lib/motion";
import type { Employee } from "@/lib/types";

/**
 * Who approves this request.
 *
 * Was two free-text boxes, and the email one decided whether a manager ever
 * heard about the request at all: it is resolved to a Jira account, and an
 * address Jira does not recognise leaves the ticket unassigned, un-emailed, and
 * waiting on somebody who was never told. The failure was recorded in the audit
 * trail and nowhere else.
 *
 * So the roster answers it now. Typing is still allowed — a manager hired
 * before this portal existed is not in the directory, and blocking HC on that
 * would be trading one silent failure for a dead end — but whichever way the
 * address arrives, it is checked against Jira before the form is submitted.
 */

export interface ManagerValue {
  managerName: string;
  managerEmail: string;
}

type Check =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "found"; displayName: string }
  | { state: "missing" }
  /** Jira could not be reached. Not the same as "wrong", and not shown as one. */
  | { state: "unknown" };

const MANUAL = "__manual__";

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

  // The in-flight lookup, so a slow answer for an old address cannot overwrite
  // the verdict for the one now in the box.
  const latest = useRef(0);

  const verify = useCallback(async (email: string) => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setCheck({ state: "idle" });
      return;
    }
    const ticket = ++latest.current;
    setCheck({ state: "checking" });
    try {
      const response = await fetch(`/api/jira/lookup?email=${encodeURIComponent(trimmed)}`);
      const payload = await response.json();
      if (ticket !== latest.current) return;
      // The route answers with `status`; this component's own idle/checking
      // states share the field, so it is read across rather than spread in.
      // Spreading the payload straight in silently produced a `state` of
      // undefined, and every lookup — including the successful ones — fell
      // through to "could not check".
      const status = payload?.ok ? payload.data?.status : undefined;
      if (status === "found") {
        setCheck({ state: "found", displayName: payload.data.displayName });
      } else if (status === "missing") {
        setCheck({ state: "missing" });
      } else {
        setCheck({ state: "unknown" });
      }
    } catch {
      if (ticket === latest.current) setCheck({ state: "unknown" });
    }
  }, []);

  // Re-check whenever the address settles, whichever way it was set — picking
  // from the roster is no guarantee that Jira knows the person either.
  useEffect(() => {
    const email = value.managerEmail;
    const timer = setTimeout(() => verify(email), 400);
    return () => clearTimeout(timer);
  }, [value.managerEmail, verify]);

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
        hint={
          manual ? undefined : "Manager yang akan menerima tiket persetujuan di Jira."
        }
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
            <span className="flex items-center gap-1.5 pt-0.5">
              {check.state === "checking" ? (
                <span className="text-ink-faint">Memeriksa akun Jira…</span>
              ) : check.state === "found" ? (
                <span className="flex items-center gap-1.5 text-ok">
                  <IconCheck className="size-3.5" />
                  Ditemukan di Jira: {check.displayName}
                </span>
              ) : check.state === "missing" ? (
                <span className="flex items-center gap-1.5 text-warn">
                  <IconAlert className="size-3.5" />
                  Jira tidak mengenali email ini — tiket akan dibuat tanpa assignee, dan
                  manager tidak menerima email.
                </span>
              ) : (
                <span className="text-ink-faint">
                  Tidak bisa memeriksa ke Jira sekarang. Pengajuan tetap bisa dikirim.
                </span>
              )}
            </span>
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
