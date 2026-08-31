/**
 * Environment configuration.
 *
 * Everything is read lazily (never at module load) so that the same build can
 * be booted with different credentials, and so a missing variable surfaces as a
 * clear error at the call site instead of a blank page at import time.
 */

/** Values shipped in `.env.example` that should never be treated as real. */
const PLACEHOLDER_PATTERN = /^(your[-_]|changeme|xxx|<.*>$)/i;

function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value || PLACEHOLDER_PATTERN.test(value)) return undefined;
  return value;
}

function readList(name: string, fallback: string[]): string[] {
  const raw = read(name);
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export interface JiraConfig {
  domain: string;
  email: string;
  apiToken: string;
  projectKey: string;
  managerIssueType: string;
  securityIssueType: string;
  securityAssigneeAccountId?: string;
  /** Jira status names that count as a manager approval. */
  approvedStatuses: string[];
  /** Jira status names that count as a manager rejection. */
  rejectedStatuses: string[];
  /** Jira status names that mean IT Security finished provisioning. */
  securityDoneStatuses: string[];
  /**
   * When true, no HTTP call leaves the process — the mock Jira client answers
   * instead. This keeps `npm run dev` working before any credentials exist.
   */
  mock: boolean;
}

export function getJiraConfig(): JiraConfig {
  const domain = read("JIRA_DOMAIN");
  const email = read("JIRA_EMAIL");
  const apiToken = read("JIRA_API_TOKEN");
  const projectKey = read("JIRA_PROJECT_KEY");

  const forced = process.env.JIRA_MOCK?.trim().toLowerCase();
  const credentialsComplete = Boolean(domain && email && apiToken && projectKey);

  // Explicit opt-in/out wins; otherwise fall back to mock whenever the
  // credentials are absent or still hold `.env.example` placeholders.
  const mock = forced === "true" ? true : forced === "false" ? false : !credentialsComplete;

  if (!mock && !credentialsComplete) {
    throw new Error(
      "Jira is configured in live mode (JIRA_MOCK=false) but JIRA_DOMAIN, JIRA_EMAIL, " +
        "JIRA_API_TOKEN and JIRA_PROJECT_KEY are not all set. See .env.example.",
    );
  }

  return {
    domain: domain ?? "example.atlassian.net",
    email: email ?? "hc-bot@example.com",
    apiToken: apiToken ?? "mock-token",
    projectKey: projectKey ?? "HC",
    managerIssueType: read("JIRA_MANAGER_ISSUE_TYPE") ?? "Task",
    securityIssueType: read("JIRA_SECURITY_ISSUE_TYPE") ?? "Task",
    securityAssigneeAccountId: read("JIRA_SECURITY_ACCOUNT_ID"),
    approvedStatuses: readList("JIRA_APPROVED_STATUSES", ["Approved", "Done"]),
    rejectedStatuses: readList("JIRA_REJECTED_STATUSES", ["Rejected", "Declined"]),
    securityDoneStatuses: readList("JIRA_SECURITY_DONE_STATUSES", ["Done", "Closed", "Resolved"]),
    mock,
  };
}

/** Shared secret Jira must present on the webhook. Undefined disables the check. */
export function getWebhookSecret(): string | undefined {
  return read("JIRA_WEBHOOK_SECRET");
}

/** Absolute path of the JSON file backing the store. */
export function getDataFilePath(): string {
  return process.env.HC_DATA_FILE?.trim() || "data/hc-store.json";
}
