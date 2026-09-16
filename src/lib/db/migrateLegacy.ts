import { randomUUID } from "node:crypto";

import type { EmployeeStatus } from "@/lib/types";

import { mutateStore, type StoreShape } from "./store";

/**
 * Retires the old Jira-era workflow.
 *
 * The store still holds requests from a flow whose code has been deleted, and
 * employees parked in statuses that flow was the only thing able to advance.
 * Those people are stuck: nothing in the application can move them, and the
 * roster reports a state that is not true of their account.
 *
 * Two things happen here, and neither invents history:
 *
 *   1. The legacy requests are archived in place. They are not converted into
 *      lifecycle requests. A decision recorded as "approved" in the old system
 *      was authorised by possession of an emailed link, and carrying that across
 *      as though it were a verified approval would launder a weaker control into
 *      a stronger-looking one. If those changes are still wanted, HC raises them
 *      again and they go through both approvals properly.
 *
 *   2. Every employee left in a legacy status is reconciled to what their
 *      ACCOUNT actually is, which is the only thing the directory now claims.
 *
 * The reconciliation rule leans deliberately towards the closed state: an
 * onboarding that never finished means no account was ever provisioned, so the
 * record becomes DISABLED. Guessing ACTIVE would be inventing access.
 */

/** Statuses that exist only in the retired model. */
const LEGACY_STATUSES = [
  "PENDING_MANAGER_APPROVAL",
  "PENDING_SECURITY_SETUP",
  "REJECTED",
  "PENDING_TRANSFER_APPROVAL",
  "PENDING_TRANSFER_SETUP",
  "PENDING_OFFBOARDING_APPROVAL",
  "PENDING_OFFBOARDING_SETUP",
] as const;

function isLegacyStatus(status: string): boolean {
  return (LEGACY_STATUSES as readonly string[]).includes(status);
}

export interface ReconciledEmployee {
  employeeId: string;
  displayName: string;
  from: string;
  to: EmployeeStatus;
  reason: string;
}

export interface LegacyMigrationReport {
  /** True when the migration had already run and nothing was touched. */
  alreadyDone: boolean;
  archivedRequests: number;
  reconciled: ReconciledEmployee[];
}

/**
 * Decides what an employee's account really is.
 *
 * The legacy request tells us which: somebody stuck mid-onboarding never had an
 * account created, while somebody stuck mid-transfer was already working and
 * already had one.
 */
function reconcile(
  draft: StoreShape,
  employeeId: string,
): { to: EmployeeStatus; reason: string } {
  const legacy = draft.requests.filter((request) => request.employeeId === employeeId);

  const unfinishedOnboarding = legacy.some(
    (request) => request.type === "ONBOARDING" && request.stage !== "COMPLETED",
  );
  if (unfinishedOnboarding) {
    return {
      to: "DISABLED",
      reason: "Onboarding lama tidak pernah selesai, sehingga akun tidak pernah dibuat.",
    };
  }

  const openChange = legacy.some(
    (request) =>
      (request.type === "TRANSFER" || request.type === "OFFBOARDING") &&
      request.stage !== "COMPLETED",
  );
  if (openChange) {
    return {
      to: "ACTIVE",
      reason:
        "Karyawan sudah bekerja dan akunnya aktif; perubahan lama tidak pernah diterapkan.",
    };
  }

  // No legacy request explains the status. Closed is the safe answer: it can be
  // reopened by a request, whereas wrongly granting access cannot be undone by
  // noticing later.
  return {
    to: "DISABLED",
    reason: "Tidak ada pengajuan lama yang menjelaskan status ini.",
  };
}

export async function migrateLegacyWorkflow(
  actorName = "HC Portal",
  actorId = "system",
): Promise<LegacyMigrationReport> {
  return mutateStore((draft) => {
    if (draft.legacyArchivedAt) {
      return { alreadyDone: true, archivedRequests: 0, reconciled: [] };
    }

    const at = new Date().toISOString();
    const reconciled: ReconciledEmployee[] = [];

    for (const employee of draft.employees) {
      if (!isLegacyStatus(employee.status)) continue;

      const { to, reason } = reconcile(draft, employee.id);
      reconciled.push({
        employeeId: employee.id,
        displayName: employee.displayName,
        from: employee.status,
        to,
        reason,
      });

      employee.status = to;
      employee.updatedAt = at;

      draft.auditEvents.push({
        id: `evt_${randomUUID()}`,
        at,
        actorId,
        actorName,
        source: "SYSTEM",
        action: "legacy.reconciled",
        target: employee.id,
        // Correlated on the employee: there is no request to hang this off,
        // which is precisely the problem being cleaned up.
        correlationId: employee.id,
        detail: { from: reconciled[reconciled.length - 1].from, to, reason },
      });
    }

    const archivedRequests = draft.requests.length;
    draft.legacyArchivedAt = at;

    draft.auditEvents.push({
      id: `evt_${randomUUID()}`,
      at,
      actorId,
      actorName,
      source: "SYSTEM",
      action: "legacy.archived",
      target: "legacy-workflow",
      correlationId: "legacy-workflow",
      detail: { archivedRequests, reconciledEmployees: reconciled.length },
    });

    return { alreadyDone: false, archivedRequests, reconciled };
  });
}
