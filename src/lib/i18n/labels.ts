import type { SortKey } from "@/lib/dashboard/directory";
import type { LifecycleStatus, LifecycleType } from "@/lib/lifecycle/types";

import type { Dictionary } from "./dictionaries/id";

/**
 * Labels for things the code names by a key rather than by a word.
 *
 * A sort key, a status, a lifecycle stage: the value is part of the model and
 * must not change with the language, so the model keeps the key and this maps
 * it to whatever the reader is reading. Kept here rather than in each component
 * so two places cannot drift into calling the same key different things.
 */

const SORT_KEY_LABEL: Record<SortKey, keyof Dictionary["directory"]> = {
  name: "columnName",
  department: "columnDepartment",
  jobTitle: "columnJobTitle",
  status: "columnStatus",
  updated: "columnUpdated",
};

export function sortLabel(t: Dictionary, key: SortKey): string {
  return t.directory[SORT_KEY_LABEL[key]];
}

const STATUS_LABEL: Record<LifecycleStatus, keyof Dictionary["lifecycle"]> = {
  DRAFT: "statusDraft",
  PENDING_MANAGER: "statusPendingManager",
  PENDING_CISO: "statusPendingCiso",
  APPROVED: "statusApproved",
  SCHEDULED: "statusScheduled",
  QUEUED: "statusQueued",
  EXECUTING: "statusExecuting",
  COMPLETED: "statusCompleted",
  FAILED: "statusFailed",
  REJECTED: "statusRejected",
  CANCELLED: "statusCancelled",
  EXPIRED: "statusExpired",
};

export function lifecycleStatusLabel(t: Dictionary, status: LifecycleStatus): string {
  return t.lifecycle[STATUS_LABEL[status]];
}

const TYPE_LABEL: Record<LifecycleType, keyof Dictionary["lifecycle"]> = {
  ONBOARDING: "typeOnboarding",
  MOVEMENT: "typeMovement",
  TERMINATION: "typeTermination",
  PROFILE_UPDATE: "typeProfileUpdate",
};

export function lifecycleTypeLabel(t: Dictionary, type: LifecycleType): string {
  return t.lifecycle[TYPE_LABEL[type]];
}
