import { randomUUID } from "node:crypto";

import type { ActivityEntry, Employee } from "@/lib/types";

import { mutateStore, readStore, type StoreShape } from "./store";

/**
 * Data-access layer for the employee directory.
 *
 * The rest of the app never imports `store.ts` directly, so moving to a real
 * database only requires reimplementing this module.
 *
 * Nothing here changes an employee any more. `addEmployee`, `setEmployeeAccess`
 * and finally `updateEmployeeProfile` were writes with no approval behind them —
 * the last one could move somebody to another department without anyone signing
 * off. All three are now lifecycle requests, applied by the execution worker
 * from a state it read back out of the directory. What survives is reading the
 * roster and the activity log.
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
