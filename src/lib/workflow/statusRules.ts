import type { JiraConfig } from "@/lib/config/env";

/**
 * Translates Jira status names into workflow decisions.
 *
 * Every team names their columns differently, so the mapping lives in
 * environment variables rather than in code.
 */

export type ManagerDecision = "APPROVED" | "REJECTED" | "PENDING";

function matches(statusName: string, candidates: string[]): boolean {
  const normalised = statusName.trim().toLowerCase();
  return candidates.some((candidate) => candidate.trim().toLowerCase() === normalised);
}

export function classifyManagerStatus(statusName: string, config: JiraConfig): ManagerDecision {
  // Rejection is checked first: a status listed in both lists should block, not pass.
  if (matches(statusName, config.rejectedStatuses)) return "REJECTED";
  if (matches(statusName, config.approvedStatuses)) return "APPROVED";
  return "PENDING";
}

export function isSecurityComplete(statusName: string, config: JiraConfig): boolean {
  return matches(statusName, config.securityDoneStatuses);
}
