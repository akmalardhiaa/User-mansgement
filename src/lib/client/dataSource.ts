import type { Employee, JiraIssueRef, NewUserInput, OnboardingRequest } from "@/lib/types";

/**
 * The write operations the dashboard UI performs.
 *
 * Components depend on this interface rather than on `fetch` directly, so the
 * same components serve both the real app (backed by the API routes) and the
 * static GitHub Pages demo (backed by an in-browser mock).
 */

export interface CreateUserResult {
  employee: Employee;
  request: OnboardingRequest;
  managerIssue?: JiraIssueRef;
}

export interface SyncResult {
  checked: number;
  advanced: number;
}

export interface DashboardDataSource {
  toggleAccess(employeeId: string, enabled: boolean): Promise<Employee>;
  createUser(input: NewUserInput): Promise<CreateUserResult>;
  sync(): Promise<SyncResult>;
}

/** Error carrying per-field messages returned by the API. */
export class SubmissionError extends Error {
  constructor(
    message: string,
    readonly fieldErrors?: Partial<Record<keyof NewUserInput, string>>,
  ) {
    super(message);
    this.name = "SubmissionError";
  }
}

async function unwrap<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || !payload?.ok) {
    throw new SubmissionError(payload?.error ?? "The request failed.", payload?.fieldErrors);
  }
  return payload.data as T;
}

/** Talks to the Next.js API routes. */
export const apiDataSource: DashboardDataSource = {
  async toggleAccess(employeeId, enabled) {
    const response = await fetch(`/api/users/${employeeId}/access`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const { employee } = await unwrap<{ employee: Employee }>(response);
    return employee;
  },

  async createUser(input) {
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return unwrap<CreateUserResult>(response);
  },

  async sync() {
    const response = await fetch("/api/workflow/sync", { method: "POST" });
    return unwrap<SyncResult>(response);
  },
};
