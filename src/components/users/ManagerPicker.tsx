"use client";

import { useT } from "@/components/i18n/LocaleProvider";
import { SelectField } from "@/components/ui/Field";
import { IconAlert, IconCheck, IconUserCheck } from "@/components/ui/Icons";
import type { Employee } from "@/lib/types";

/**
 * Who approves this request.
 *
 * Whatever address ends up here is where the approval email goes, so this is
 * the one field on the form that decides who is allowed to say yes. It used to
 * offer "manager not on the list…" and a free-text address — which let a
 * requester route their own request's first approval to any mailbox at all,
 * including one they controlled. Now the only choices are active people in the
 * directory, and the server refuses anything else regardless of what this
 * component offers.
 *
 * The confirmation line names the actual address, because "will be sent to
 * x@y" is something HC can read back and catch a wrong choice in.
 */

export interface ManagerValue {
  managerName: string;
  managerEmail: string;
}

export function ManagerPicker({
  employees,
  value,
  onChange,
  nameError,
  emailError,
}: {
  /** The roster to choose from. Only active people are offered. */
  employees: Employee[];
  value: ManagerValue;
  onChange: (next: ManagerValue) => void;
  nameError?: string;
  emailError?: string;
}) {
  const t = useT();
  const candidates = employees.filter((employee) => employee.status === "ACTIVE");
  const address = value.managerEmail.trim().toLowerCase();
  const matched = candidates.find((employee) => employee.email.toLowerCase() === address);

  // A value carried over from an earlier version of a request (a revision) may
  // name somebody who is no longer selectable. Say so, rather than silently
  // showing an empty picker and leaving HC to wonder where the manager went.
  const stale = Boolean(address) && !matched;

  function select(email: string) {
    const employee = candidates.find((candidate) => candidate.email === email);
    onChange({
      managerName: employee?.displayName ?? "",
      managerEmail: employee?.email ?? "",
    });
  }

  return (
    <div className="space-y-2">
      <SelectField
        label={t.forms.manager}
        name="managerSelect"
        icon={<IconUserCheck />}
        value={matched?.email ?? ""}
        onChange={(event) => select(event.target.value)}
        error={nameError ?? emailError}
        hint={t.editProfile.managerHint}
      >
        <option value="">{t.editProfile.chooseManager}</option>
        {candidates.map((employee) => (
          <option key={employee.id} value={employee.email}>
            {employee.displayName} · {employee.department}
          </option>
        ))}
      </SelectField>

      {matched ? (
        <p className="flex items-center gap-1.5 text-xs text-ok">
          <IconCheck className="size-3.5 shrink-0" />
          <span>
            Email persetujuan dikirim ke <span className="font-mono break-all">{matched.email}</span>
          </span>
        </p>
      ) : stale ? (
        <p className="flex items-center gap-1.5 text-xs text-warn">
          <IconAlert className="size-3.5 shrink-0" />
          <span>
            Manager sebelumnya (<span className="font-mono break-all">{address}</span>) tidak ada
            atau tidak aktif di direktori. Pilih ulang dari daftar.
          </span>
        </p>
      ) : null}
    </div>
  );
}
