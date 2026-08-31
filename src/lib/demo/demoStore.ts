import type {
  CreateUserResult,
  DashboardDataSource,
  SyncResult,
} from "@/lib/client/dataSource";
import { SubmissionError } from "@/lib/client/dataSource";
import { seedEmployees } from "@/lib/db/seed";
import type { AccessRequest, Employee, JiraIssueRef, NewUserInput } from "@/lib/types";
import { parseNewUserInput } from "@/lib/validation/userInput";
import { classifyManagerStatus, isSecurityComplete } from "@/lib/workflow/statusRules";

/**
 * Browser-only re-implementation of the onboarding workflow, used by the static
 * GitHub Pages demo where no server exists.
 *
 * It reuses the real validation rules, seed data and status mapping, but keeps
 * everything in memory and stands in for Jira with locally generated ticket
 * keys. The authoritative implementation is `src/lib/workflow/accessWorkflow.ts`.
 */

/** Mirrors the defaults documented in `.env.example`. */
export const DEMO_STATUS_RULES = {
  approvedStatuses: ["Approved", "Done"],
  rejectedStatuses: ["Rejected", "Declined"],
  securityDoneStatuses: ["Done", "Closed", "Resolved"],
};

const DEMO_PROJECT_KEY = "HC";

export interface DemoState {
  employees: Employee[];
  requests: AccessRequest[];
}

function now(): string {
  return new Date().toISOString();
}

function event(type: string, message: string, actor?: string, issueKey?: string) {
  return { at: now(), type, message, actor, issueKey };
}

export class DemoStore implements DashboardDataSource {
  private employees: Employee[] = seedEmployees();
  private requests: AccessRequest[] = [];
  private ticketCounter = 1000;
  private listeners = new Set<() => void>();

  /* ---------------------------------------------------------------- */
  /* Subscription (drives React re-renders)                            */
  /* ---------------------------------------------------------------- */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private snapshot: DemoState = { employees: [], requests: [] };

  getSnapshot = (): DemoState => this.snapshot;

  private emit(): void {
    // A fresh object identity each time so useSyncExternalStore sees the change.
    this.snapshot = {
      employees: [...this.employees].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      requests: [...this.requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
    for (const listener of this.listeners) listener();
  }

  constructor() {
    this.emit();
  }

  private nextTicket(): JiraIssueRef {
    this.ticketCounter += 1;
    const key = `${DEMO_PROJECT_KEY}-${this.ticketCounter}`;
    // A demo ticket has no real Jira behind it, so the link stays inert.
    return { key, url: "#", status: "To Do" };
  }

  /* ---------------------------------------------------------------- */
  /* DashboardDataSource                                               */
  /* ---------------------------------------------------------------- */

  async createUser(input: NewUserInput): Promise<CreateUserResult> {
    const parsed = parseNewUserInput(input);
    if (!parsed.ok) {
      throw new SubmissionError("Please correct the highlighted fields.", parsed.errors);
    }

    const value = parsed.value;
    if (this.employees.some((e) => e.email.toLowerCase() === value.email.toLowerCase())) {
      const message = `An employee with the email ${value.email} already exists.`;
      throw new SubmissionError(message, { email: message });
    }

    const timestamp = now();
    const employeeId = `emp_demo_${this.ticketCounter}_${this.employees.length}`;
    const requestId = `req_demo_${this.ticketCounter}_${this.requests.length}`;
    const managerIssue = this.nextTicket();
    managerIssue.assignee = value.managerName;

    const employee: Employee = {
      ...value,
      id: employeeId,
      status: "PENDING_MANAGER_APPROVAL",
      activeRequestId: requestId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const request: AccessRequest = {
      id: requestId,
      employeeId,
      type: "ONBOARDING",
      stage: "MANAGER_APPROVAL",
      managerIssue,
      processedSignals: [],
      events: [
        event("request.created", `HC submitted an onboarding request for ${value.name}.`, "HC Portal"),
        event(
          "manager.requested",
          `Approval ticket ${managerIssue.key} raised for ${value.managerName}.`,
          "HC Portal",
          managerIssue.key,
        ),
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.employees.push(employee);
    this.requests.push(request);
    this.emit();

    return { employee, request, managerIssue };
  }

  async requestRemoval(employeeId: string, reason?: string): Promise<CreateUserResult> {
    const employee = this.employees.find((candidate) => candidate.id === employeeId);
    if (!employee) throw new Error(`Employee ${employeeId} was not found.`);
    if (employee.status !== "ACTIVE" && employee.status !== "DISABLED") {
      throw new Error(
        `${employee.name} cannot be removed while the account is ${employee.status}.`,
      );
    }

    const timestamp = now();
    const requestId = `req_demo_removal_${this.requests.length}`;
    const managerIssue = this.nextTicket();
    managerIssue.assignee = employee.managerName;

    const request: AccessRequest = {
      id: requestId,
      employeeId,
      type: "OFFBOARDING",
      stage: "MANAGER_APPROVAL",
      reason: reason?.trim() || undefined,
      previousStatus: employee.status,
      managerIssue,
      processedSignals: [],
      events: [
        event("request.created", `HC requested access removal for ${employee.name}.`, "HC Portal"),
        event(
          "manager.requested",
          `Removal approval ticket ${managerIssue.key} raised for ${employee.managerName}.`,
          "HC Portal",
          managerIssue.key,
        ),
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    employee.status = "PENDING_REMOVAL_APPROVAL";
    employee.activeRequestId = requestId;
    employee.updatedAt = timestamp;
    this.requests.push(request);
    this.emit();

    return { employee, request, managerIssue };
  }

  async toggleAccess(employeeId: string, enabled: boolean): Promise<Employee> {
    const employee = this.employees.find((candidate) => candidate.id === employeeId);
    if (!employee) throw new Error(`Employee ${employeeId} was not found.`);
    if (employee.status !== "ACTIVE" && employee.status !== "DISABLED") {
      throw new Error(
        `Access for ${employee.name} cannot be changed while the account is ${employee.status}.`,
      );
    }
    employee.status = enabled ? "ACTIVE" : "DISABLED";
    employee.updatedAt = now();
    this.emit();
    return employee;
  }

  /** There is no Jira to poll in the demo, so this is a no-op reconcile. */
  async sync(): Promise<SyncResult> {
    const open = this.requests.filter(
      (request) =>
        request.stage === "MANAGER_APPROVAL" || request.stage === "SECURITY_PROVISIONING",
    );
    return { checked: open.length, advanced: 0 };
  }

  /* ---------------------------------------------------------------- */
  /* Jira simulator — stands in for the webhook                        */
  /* ---------------------------------------------------------------- */

  /**
   * Applies a Jira status change, mirroring `applyIssueStatus()` on the server.
   * Returns a human-readable outcome for the demo's activity log.
   */
  applyTransition(issueKey: string, statusName: string, actor: string): string {
    const key = issueKey.toUpperCase();
    const request = this.requests.find(
      (candidate) =>
        candidate.managerIssue?.key.toUpperCase() === key ||
        candidate.securityIssue?.key.toUpperCase() === key,
    );
    if (!request) return `No onboarding request is tracking ${issueKey}.`;

    const signal = `${key}:${statusName.toLowerCase()}`;
    if (request.processedSignals.includes(signal)) {
      return `${issueKey} → "${statusName}" was already processed.`;
    }

    const employee = this.employees.find((candidate) => candidate.id === request.employeeId);
    if (!employee) return `Request ${request.id} has no employee record.`;

    const timestamp = now();

    // Step 2 — the manager's decision.
    if (request.managerIssue?.key.toUpperCase() === key && request.stage === "MANAGER_APPROVAL") {
      request.managerIssue.status = statusName;
      const decision = classifyManagerStatus(statusName, DEMO_STATUS_RULES);

      if (decision === "PENDING") {
        this.emit();
        return `"${statusName}" is not an approval or rejection status.`;
      }

      request.processedSignals.push(signal);
      request.updatedAt = timestamp;
      employee.updatedAt = timestamp;

      if (decision === "REJECTED") {
        request.stage = "REJECTED";
        employee.status =
          request.type === "OFFBOARDING" ? (request.previousStatus ?? "ACTIVE") : "REJECTED";
        employee.activeRequestId = undefined;
        request.events.push(
          event("manager.rejected", `${actor} rejected the request on ${issueKey}.`, actor, issueKey),
        );
        this.emit();
        return `Request rejected by ${actor}.`;
      }

      // Step 3 — approval automatically raises the IT Security ticket.
      const securityIssue = this.nextTicket();
      request.stage = "SECURITY_PROVISIONING";
      request.securityIssue = securityIssue;
      employee.status =
        request.type === "OFFBOARDING" ? "PENDING_REMOVAL_SETUP" : "PENDING_SECURITY_SETUP";
      request.events.push(
        event("manager.approved", `${actor} approved the request on ${issueKey}.`, actor, issueKey),
        event(
          "security.requested",
          `Provisioning ticket ${securityIssue.key} raised for IT Security.`,
          "HC Portal",
          securityIssue.key,
        ),
      );
      this.emit();
      return `Approved by ${actor}; provisioning ticket ${securityIssue.key} raised.`;
    }

    // Step 4 — IT Security closes their ticket.
    if (
      request.securityIssue?.key.toUpperCase() === key &&
      request.stage === "SECURITY_PROVISIONING"
    ) {
      request.securityIssue.status = statusName;

      if (!isSecurityComplete(statusName, DEMO_STATUS_RULES)) {
        this.emit();
        return `"${statusName}" does not close the provisioning ticket.`;
      }

      request.processedSignals.push(signal);
      request.stage = "COMPLETED";
      request.updatedAt = timestamp;
      employee.status = request.type === "OFFBOARDING" ? "REMOVED" : "ACTIVE";
      employee.activeRequestId = undefined;
      employee.updatedAt = timestamp;
      request.events.push(
        event(
          "security.completed",
          `${actor} closed ${issueKey}; ${employee.name} is now ${employee.status === "REMOVED" ? "Removed" : "Active"}.`,
          actor,
          issueKey,
        ),
      );
      this.emit();
      return `${employee.name} is now ${employee.status === "REMOVED" ? "Removed" : "Active"}.`;
    }

    return `${issueKey} moved to "${statusName}" but the request is at stage ${request.stage}.`;
  }

  /** Tickets a demo visitor can currently act on. */
  openTickets(): Array<{ issue: JiraIssueRef; employeeName: string; stage: string }> {
    return this.requests.flatMap((request) => {
      const employee = this.employees.find((candidate) => candidate.id === request.employeeId);
      if (request.stage === "MANAGER_APPROVAL" && request.managerIssue) {
        return [
          {
            issue: request.managerIssue,
            employeeName: employee?.name ?? "",
            stage: "Manager approval",
          },
        ];
      }
      if (request.stage === "SECURITY_PROVISIONING" && request.securityIssue) {
        return [
          {
            issue: request.securityIssue,
            employeeName: employee?.name ?? "",
            stage:
              request.type === "OFFBOARDING"
                ? "IT Security deprovisioning"
                : "IT Security provisioning",
          },
        ];
      }
      return [];
    });
  }
}
