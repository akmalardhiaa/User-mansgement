/**
 * Translates Jira status names into workflow decisions.
 *
 * Every team names their columns differently, so the mapping lives in
 * environment variables rather than in code.
 *
 * These take the plain status lists rather than a full `JiraConfig` so the
 * browser-only demo can reuse the exact same rules as the server.
 */

export type ManagerDecision = "APPROVED" | "REJECTED" | "PENDING";

export interface ManagerStatusRules {
  approvedStatuses: string[];
  rejectedStatuses: string[];
}

export interface SecurityStatusRules {
  securityDoneStatuses: string[];
}

function matches(statusName: string, candidates: string[]): boolean {
  const normalised = statusName.trim().toLowerCase();
  return candidates.some((candidate) => candidate.trim().toLowerCase() === normalised);
}

export function classifyManagerStatus(
  statusName: string,
  rules: ManagerStatusRules,
): ManagerDecision {
  // Rejection is checked first: a status listed in both lists should block, not pass.
  if (matches(statusName, rules.rejectedStatuses)) return "REJECTED";
  if (matches(statusName, rules.approvedStatuses)) return "APPROVED";
  return "PENDING";
}

export function isSecurityComplete(statusName: string, rules: SecurityStatusRules): boolean {
  return matches(statusName, rules.securityDoneStatuses);
}
