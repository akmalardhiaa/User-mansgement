import { readStore } from "@/lib/db/store";

import { pendingByEmployee, type PendingByEmployee } from "./pending";

/**
 * The open-request index, read from the store.
 *
 * Kept apart from `pending.ts` so the indexing rules stay a pure function that
 * a test can exercise without a filesystem, while the one place that touches
 * the store lives here.
 *
 * Note this is NOT scope-filtered. It answers "does this person have something
 * in flight", which the directory shows to anyone who may read the directory at
 * all; it carries no payload, no approver, and no reason. Anything that exposes
 * the request itself goes through the lifecycle service, which does check scope.
 */
export async function loadPendingByEmployee(): Promise<PendingByEmployee> {
  const { lifecycleRequests } = await readStore();
  return pendingByEmployee(lifecycleRequests);
}

export async function loadPendingEmployeeIds(): Promise<Set<string>> {
  return new Set(Object.keys(await loadPendingByEmployee()));
}
