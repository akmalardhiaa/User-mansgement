import { randomUUID } from "node:crypto";

import type {
  AccessRequest,
  Employee,
  EmployeeStatus,
  NewUserInput,
  TransferInput,
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
    super(`Karyawan dengan email ${email} sudah terdaftar.`);
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

export async function listRequests(): Promise<AccessRequest[]> {
  const { requests } = await readStore();
  return [...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getEmployeeById(id: string): Promise<Employee | undefined> {
  const { employees } = await readStore();
  return employees.find((employee) => employee.id === id);
}

export async function getRequestById(id: string): Promise<AccessRequest | undefined> {
  const { requests } = await readStore();
  return requests.find((request) => request.id === id);
}

/** Requests still waiting on Jira — the working set for the polling fallback. */
export async function listOpenRequests(): Promise<AccessRequest[]> {
  const { requests } = await readStore();
  return requests.filter(
    (request) => request.stage === "MANAGER_APPROVAL" || request.stage === "SECURITY_PROVISIONING",
  );
}

/** Locate the request that owns a Jira issue, whichever step created it. */
export function findRequestByIssueKeyInDraft(
  draft: StoreShape,
  issueKey: string,
): AccessRequest | undefined {
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
  actor = "HC Portal",
): Promise<{ employee: Employee; request: AccessRequest }> {
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
      firstName: input.firstName,
      lastName: input.lastName,
      displayName: input.displayName,
      email: input.email,
      jobTitle: input.jobTitle,
      department: input.department,
      managerName: input.managerName,
      managerEmail: input.managerEmail,
      managerAccountId: input.managerAccountId,
      description: input.description,
      status: "PENDING_MANAGER_APPROVAL",
      activeRequestId: requestId,
      createdAt: now,
      updatedAt: now,
    };

    const request: AccessRequest = {
      id: requestId,
      employeeId,
      type: "ONBOARDING",
      stage: "MANAGER_APPROVAL",
      events: [
        makeEvent("request.created", `HC mengajukan pembuatan akun untuk ${input.displayName}.`, {
          actor,
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

export class RequestNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestNotAllowedError";
  }
}

/**
 * Opens a transfer request against an employee who already exists.
 *
 * Nothing about their position changes yet — the target is parked on the
 * request and only applied once IT Security closes the second ticket. Their
 * current status is stashed so a manager's rejection can restore it.
 */
export async function createTransfer(
  employeeId: string,
  target: TransferInput,
  actor = "HC Portal",
): Promise<{ employee: Employee; request: AccessRequest }> {
  return transaction((draft) => {
    const employee = draft.employees.find((candidate) => candidate.id === employeeId);
    if (!employee) throw new RequestNotAllowedError(`Karyawan ${employeeId} tidak ditemukan.`);

    // Only a settled account can be moved: one already mid-approval would end
    // up with two requests fighting over its status.
    const movable: EmployeeStatus[] = ["ACTIVE", "DISABLED"];
    if (!movable.includes(employee.status)) {
      throw new RequestNotAllowedError(
        `Posisi ${employee.displayName} tidak bisa diubah selama statusnya ${employee.status}.`,
      );
    }

    if (
      employee.department === target.department &&
      employee.jobTitle === target.jobTitle &&
      !target.managerEmail
    ) {
      throw new RequestNotAllowedError(
        `${employee.displayName} sudah berada di posisi tersebut, tidak ada yang perlu diubah.`,
      );
    }

    const now = timestamp();
    const requestId = `req_${randomUUID()}`;

    const request: AccessRequest = {
      id: requestId,
      employeeId,
      type: "TRANSFER",
      stage: "MANAGER_APPROVAL",
      reason: target.reason,
      transfer: {
        department: target.department,
        jobTitle: target.jobTitle,
        managerName: target.managerName,
        managerEmail: target.managerEmail,
      },
      previousStatus: employee.status,
      events: [
        makeEvent(
          "request.created",
          `HC mengajukan pemindahan ${employee.displayName} ke ${target.department} sebagai ${target.jobTitle}.`,
          { actor },
        ),
      ],
      processedSignals: [],
      createdAt: now,
      updatedAt: now,
    };

    employee.status = "PENDING_TRANSFER_APPROVAL";
    employee.activeRequestId = requestId;
    employee.updatedAt = now;
    draft.requests.push(request);

    return { employee, request };
  });
}

/** Reverses a transfer request whose Jira ticket could not be created. */
export async function cancelTransfer(requestId: string): Promise<void> {
  await transaction((draft) => {
    const request = draft.requests.find((candidate) => candidate.id === requestId);
    if (!request) return;
    const employee = draft.employees.find((candidate) => candidate.id === request.employeeId);
    if (employee) {
      employee.status = request.previousStatus ?? "ACTIVE";
      employee.activeRequestId = undefined;
    }
    draft.requests = draft.requests.filter((candidate) => candidate.id !== requestId);
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
      throw new Error(`Karyawan ${id} tidak ditemukan.`);
    }

    const allowed: EmployeeStatus[] = ["ACTIVE", "DISABLED"];
    if (!allowed.includes(employee.status)) {
      throw new Error(
        `Akses ${employee.displayName} tidak bisa diubah selama statusnya ${employee.status}.`,
      );
    }

    employee.status = enabled ? "ACTIVE" : "DISABLED";
    employee.updatedAt = timestamp();
    return employee;
  });
}
