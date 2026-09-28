import type { LifecycleRequest, LifecycleStatus, LifecycleType } from "./types";
import { isActive } from "./stateMachine";

/**
 * What the directory needs to know about open requests.
 *
 * The roster shows the state of an ACCOUNT. This is the separate, smaller fact
 * that sits beside it: somebody has asked for a change to this person, and it
 * has not landed yet. Keeping it as its own value rather than folding it into
 * the employee's status is the whole point — the request can be rejected,
 * revised, or fail, and none of that should have retroactively edited what the
 * directory said was true about the account.
 */

export interface PendingMarker {
  requestId: string;
  type: LifecycleType;
  status: LifecycleStatus;
}

export type PendingByEmployee = Record<string, PendingMarker | undefined>;

/**
 * Indexes open requests by the employee they concern.
 *
 * Onboarding requests are absent by design: there is no employee record to
 * attach them to until one is created, which is the thing being asked for.
 */
export function pendingByEmployee(requests: readonly LifecycleRequest[]): PendingByEmployee {
  const index: PendingByEmployee = {};

  for (const request of requests) {
    if (!request.employeeId || !isActive(request.status)) continue;
    index[request.employeeId] = {
      requestId: request.id,
      type: request.type,
      status: request.status,
    };
  }

  return index;
}

/** Just the ids, for the places that only need "is this person busy?". */
export function pendingEmployeeIds(requests: readonly LifecycleRequest[]): Set<string> {
  return new Set(Object.keys(pendingByEmployee(requests)));
}

const TYPE_LABEL: Record<LifecycleType, string> = {
  ONBOARDING: "Onboarding",
  MOVEMENT: "Movement",
  TERMINATION: "Termination",
  PROFILE_UPDATE: "Perubahan Profil",
};

const STATUS_LABEL: Partial<Record<LifecycleStatus, string>> = {
  DRAFT: "draf",
  PENDING_MANAGER: "menunggu manager",
  PENDING_CISO: "menunggu CISO",
  APPROVED: "disetujui",
  SCHEDULED: "terjadwal",
  QUEUED: "antre eksekusi",
  EXECUTING: "sedang dijalankan",
  FAILED: "gagal",
};

export function pendingLabel(marker: PendingMarker): string {
  return `${TYPE_LABEL[marker.type]} · ${STATUS_LABEL[marker.status] ?? marker.status.toLowerCase()}`;
}

export function lifecycleTypeLabel(type: LifecycleType): string {
  return TYPE_LABEL[type];
}

/**
 * Somebody being onboarded, for the dashboard, before they have an account.
 *
 * The directory table lists accounts, and this person has none yet — putting
 * them in it would say an account exists that no directory has confirmed. But
 * HC raised the request and wants to see it the moment they did, so the
 * dashboard shows these separately, as what they are: a person on their way
 * in, at a named step, with no account until the worker has made one.
 */
export interface OnboardingInFlight {
  requestId: string;
  displayName: string;
  email: string;
  jobTitle: string;
  department: string;
  managerName: string;
  status: LifecycleStatus;
  effectiveAt?: string;
  createdAt: string;
}

export function onboardingsInFlight(requests: readonly LifecycleRequest[]): OnboardingInFlight[] {
  return requests
    .filter((request) => request.payload.kind === "ONBOARDING" && isActive(request.status))
    .map((request) => {
      const payload = request.payload as Extract<LifecycleRequest["payload"], { kind: "ONBOARDING" }>;
      return {
        requestId: request.id,
        displayName: payload.displayName,
        email: payload.email,
        jobTitle: payload.jobTitle,
        department: payload.department,
        managerName: request.approvals[0]?.approver.name ?? payload.managerName,
        status: request.status,
        effectiveAt: request.effectiveAt,
        createdAt: request.createdAt,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
