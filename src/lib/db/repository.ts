import { randomUUID } from "node:crypto";

import type {
  Employee,
  EmployeeStatus,
  NewUserInput,
  OnboardingRequest,
  WorkflowEvent,
} from "@/lib/types";

import { mutateStore, readStore, type StoreShape } from "./store";

/**
 * Data-access layer. The rest of the app never imports `store.ts` directly, so
 * moving to a real database only requires reimplementing this module.
 */

/** Run several related reads/writes as one atomic store transaction. */
export const transaction = mutateStore;

export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`An employee with the email ${email} already exists.`);
    this.name = "DuplicateEmailError";
  }
}

function timestamp(): string {
  return new Date().toISOString();
}

export function makeEvent(
  type: string,
  message: string,
  extra: Pick<WorkflowEvent, "actor" | "issueKey"> = {},
): WorkflowEvent {
  return { at: timestamp(), type, message, ...extra };
}

export async function listEmployees(): Promise<Employee[]> {
  const { employees } = await readStore();
  // Newest first, so freshly submitted joiners sit at the top of the table.
  return [...employees].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listRequests(): Promise<OnboardingRequest[]> {
  const { requests } = await readStore();
  return [...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getEmployeeById(id: string): Promise<Employee | undefined> {
  const { employees } = await readStore();
  return employees.find((employee) => employee.id === id);
}

export async function getRequestById(id: string): Promise<OnboardingRequest | undefined> {
  const { requests } = await readStore();
  return requests.find((request) => request.id === id);
}

/** Requests still waiting on Jira — the working set for the polling fallback. */
export async function listOpenRequests(): Promise<OnboardingRequest[]> {
  const { requests } = await readStore();
  return requests.filter(
    (request) => request.stage === "MANAGER_APPROVAL" || request.stage === "SECURITY_PROVISIONING",
  );
}

/** Locate the request that owns a Jira issue, whichever step created it. */
export function findRequestByIssueKeyInDraft(
  draft: StoreShape,
  issueKey: string,
): OnboardingRequest | undefined {
  const key = issueKey.toUpperCase();
  return draft.requests.find(
    (request) =>
      request.managerIssue?.key.toUpperCase() === key ||
      request.securityIssue?.key.toUpperCase() === key,
  );
}

/**
 * Creates the employee record (parked in `PENDING_MANAGER_APPROVAL`) together
 * with its onboarding request, in a single atomic write.
 */
export async function createOnboarding(
  input: NewUserInput,
): Promise<{ employee: Employee; request: OnboardingRequest }> {
  return transaction((draft) => {
    const email = input.email.toLowerCase();
    if (draft.employees.some((employee) => employee.email.toLowerCase() === email)) {
      throw new DuplicateEmailError(input.email);
    }

    const now = timestamp();
    const employeeId = `emp_${randomUUID()}`;
    const requestId = `req_${randomUUID()}`;

    const employee: Employee = {
      id: employeeId,
      name: input.name,
      email: input.email,
      jobTitle: input.jobTitle,
      department: input.department,
      managerName: input.managerName,
      managerEmail: input.managerEmail,
      managerAccountId: input.managerAccountId,
      status: "PENDING_MANAGER_APPROVAL",
      onboardingRequestId: requestId,
      createdAt: now,
      updatedAt: now,
    };

    const request: OnboardingRequest = {
      id: requestId,
      employeeId,
      stage: "MANAGER_APPROVAL",
      events: [
        makeEvent("request.created", `HC submitted an onboarding request for ${input.name}.`, {
          actor: "HC Portal",
        }),
      ],
      processedSignals: [],
      createdAt: now,
      updatedAt: now,
    };

    draft.employees.push(employee);
    draft.requests.push(request);
    return { employee, request };
  });
}

/** Removes an onboarding request and its employee — used to roll back a failed submit. */
export async function deleteOnboarding(requestId: string): Promise<void> {
  await transaction((draft) => {
    const request = draft.requests.find((candidate) => candidate.id === requestId);
    if (!request) return;
    draft.requests = draft.requests.filter((candidate) => candidate.id !== requestId);
    draft.employees = draft.employees.filter((candidate) => candidate.id !== request.employeeId);
  });
}

/** HC toggling access on an existing employee from the dashboard. */
export async function setEmployeeAccess(id: string, enabled: boolean): Promise<Employee> {
  return transaction((draft) => {
    const employee = draft.employees.find((candidate) => candidate.id === id);
    if (!employee) {
      throw new Error(`Employee ${id} was not found.`);
    }

    const allowed: EmployeeStatus[] = ["ACTIVE", "DISABLED"];
    if (!allowed.includes(employee.status)) {
      throw new Error(
        `Access for ${employee.name} cannot be changed while the account is ${employee.status}.`,
      );
    }

    employee.status = enabled ? "ACTIVE" : "DISABLED";
    employee.updatedAt = timestamp();
    return employee;
  });
}
