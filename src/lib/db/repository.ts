import { randomUUID } from "node:crypto";

import { isActive } from "@/lib/lifecycle/stateMachine";
import type { ActivityEntry, Employee } from "@/lib/types";

import { mutateStore, readStore, type StoreShape } from "./store";

/**
 * Data-access layer for the employee directory.
 *
 * The rest of the app never imports `store.ts` directly, so moving to a real
 * database only requires reimplementing this module.
 *
 * Nothing here creates or disables an account any more. `addEmployee` and
 * `setEmployeeAccess` were the last two writes that changed who has access with
 * no approval behind them; both are now lifecycle requests, applied by the
 * execution worker from a state it read back out of the directory. What
 * survives is reading the roster, and editing the fields that carry no access
 * consequence.
 */

/** Run several related reads/writes as one atomic store transaction. */
export const transaction = mutateStore;

function timestamp(): string {
  return new Date().toISOString();
}

/* -------------------------------------------------------------------------- */
/* Activity log                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Appends to the log inside an existing transaction.
 *
 * Takes the draft rather than opening its own write, so the record and the
 * change it describes commit together — a log that can disagree with the data
 * is worse than no log, because it is trusted.
 */
export function recordActivityInDraft(
  draft: StoreShape,
  entry: Omit<ActivityEntry, "id" | "at">,
): ActivityEntry {
  const activity: ActivityEntry = { id: `act_${randomUUID()}`, at: timestamp(), ...entry };
  draft.activity.unshift(activity);
  // Kept bounded: this is a JSON file loaded whole on every read, and an
  // unbounded log would eventually make every request slower. The approval
  // chain's own audit trail lives on the request and is never trimmed.
  if (draft.activity.length > ACTIVITY_LIMIT) draft.activity.length = ACTIVITY_LIMIT;
  return activity;
}

/** Standalone append, for callers that are not already inside a transaction. */
export async function recordActivity(
  entry: Omit<ActivityEntry, "id" | "at">,
): Promise<ActivityEntry> {
  return transaction((draft) => recordActivityInDraft(draft, entry));
}

const ACTIVITY_LIMIT = 500;

export async function listActivity(): Promise<ActivityEntry[]> {
  const { activity } = await readStore();
  return [...activity].sort((a, b) => b.at.localeCompare(a.at));
}

export async function listEmployees(): Promise<Employee[]> {
  const { employees } = await readStore();
  // Newest first, so freshly submitted joiners sit at the top of the table.
  return [...employees].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getEmployeeById(id: string): Promise<Employee | undefined> {
  const { employees } = await readStore();
  return employees.find((employee) => employee.id === id);
}

/** The profile fields HC may edit directly, without an approval. */
export interface EmployeeProfilePatch {
  firstName: string;
  lastName: string;
  displayName: string;
  jobTitle: string;
  jobDescription?: string;
  department: string;
  employmentType?: "PERMANENT" | "CONTRACT";
  expiredDate?: string;
  locationType?: "PUSAT" | "CABANG";
  branchName?: string;
  description?: string;
}

/**
 * Edits an employee's profile in place.
 *
 * Deliberately narrow. Email is not editable here — it is the key that ties a
 * record to its login account and to any outstanding approval requests for
 * it, so changing it silently would orphan both. Neither is the manager, nor
 * the department-of-record used by an in-flight request: moving someone
 * between divisions is what the TRANSFER flow exists for, and letting this
 * form do it would route the change around the manager approval.
 */
export async function updateEmployeeProfile(
  id: string,
  patch: EmployeeProfilePatch,
  actor: string,
): Promise<Employee> {
  return transaction((draft) => {
    const employee = draft.employees.find((candidate) => candidate.id === id);
    if (!employee) {
      throw new Error(`Karyawan ${id} tidak ditemukan.`);
    }

    // A request in flight owns this person's department and job title until it
    // resolves, so editing them now would make the approved payload disagree
    // with the record it was raised from. Read from the requests themselves
    // rather than a flag on the employee: one source of truth, and it cannot
    // drift out of step with the request it describes.
    const open = draft.lifecycleRequests.find(
      (request) => request.employeeId === employee.id && isActive(request.status),
    );
    if (open) {
      throw new Error(
        `${employee.displayName} sedang dalam proses persetujuan. Selesaikan atau batalkan permintaan itu dulu.`,
      );
    }

    const changed: string[] = [];
    const note = (label: string, from: unknown, to: unknown) => {
      if (from !== to) changed.push(label);
    };

    note("nama", employee.displayName, patch.displayName);
    note("jabatan", employee.jobTitle, patch.jobTitle);
    note("departemen", employee.department, patch.department);
    note("status kepegawaian", employee.employmentType, patch.employmentType);
    note("lokasi", employee.locationType, patch.locationType);

    employee.firstName = patch.firstName;
    employee.lastName = patch.lastName;
    employee.displayName = patch.displayName;
    employee.jobTitle = patch.jobTitle;
    employee.jobDescription = patch.jobDescription || undefined;
    employee.department = patch.department;
    employee.employmentType = patch.employmentType;
    // Only a contract has an end date. Clearing it when the type flips back to
    // permanent stops a stale date sitting on the record and later reading as
    // an expiry that was never meant to apply.
    employee.expiredDate = patch.employmentType === "CONTRACT" ? patch.expiredDate : undefined;
    employee.locationType = patch.locationType;
    employee.branchName = patch.locationType === "CABANG" ? patch.branchName : undefined;
    employee.description = patch.description || undefined;
    employee.updatedAt = timestamp();

    recordActivityInDraft(draft, {
      actor,
      action: "employee.profile_updated",
      employeeId: employee.id,
      employeeName: employee.displayName,
      detail:
        changed.length > 0
          ? `Profil ${employee.displayName} diperbarui — ${changed.join(", ")}.`
          : `Profil ${employee.displayName} diperbarui.`,
    });

    return employee;
  });
}
