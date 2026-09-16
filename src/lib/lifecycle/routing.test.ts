import { afterEach, describe, expect, it, vi } from "vitest";

import type { Employee } from "@/lib/types";

import {
  RoutingError,
  SeparationOfDutiesError,
  assertSeparationOfDuties,
  isSamePerson,
  resolveCiso,
  resolveManager,
} from "./routing";
import type { ActorIdentity, MovementPayload, OnboardingPayload, TerminationPayload } from "./types";

// `vi.stubEnv` rather than assigning to process.env: NODE_ENV is typed
// read-only, and this restores every stub afterwards without a hand-rolled
// snapshot that a later edit could forget to keep in step.
afterEach(() => {
  vi.unstubAllEnvs();
});

function employee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp_seed_002",
    firstName: "Rizky",
    lastName: "Maulana",
    displayName: "Rizky Maulana",
    email: "rizky.maulana@example.com",
    jobTitle: "Senior Backend Engineer",
    department: "IT — Engineering",
    managerName: "Sarah Wijaya",
    managerEmail: "sarah.wijaya@example.com",
    status: "ACTIVE",
    createdAt: "2026-01-06T09:00:00.000Z",
    updatedAt: "2026-01-06T09:00:00.000Z",
    ...overrides,
  };
}

const onboarding: OnboardingPayload = {
  kind: "ONBOARDING",
  nik: "2026001",
  firstName: "Citra",
  lastName: "Wulandari",
  displayName: "Citra Wulandari",
  email: "citra.wulandari@example.com",
  jobTitle: "Backend Engineer",
  department: "IT — Engineering",
  employmentType: "PERMANENT",
  locationType: "PUSAT",
  managerName: "Sarah Wijaya",
  managerEmail: "Sarah.Wijaya@Example.com",
  startDate: "2026-10-01",
  accessProfileId: "engineering",
};

const movement: MovementPayload = {
  kind: "MOVEMENT",
  employeeId: "emp_seed_002",
  toDepartment: "IT — Security",
  toJobTitle: "Security Engineer",
  toManagerName: "Bagus Nugroho",
  toManagerEmail: "bagus.nugroho@example.com",
  accessProfileId: "security",
  reason: "Rotasi internal.",
};

const termination: TerminationPayload = {
  kind: "TERMINATION",
  employeeId: "emp_seed_002",
  reasonCategory: "RESIGN",
  lastWorkingDate: "2026-10-31",
};

describe("which manager approves", () => {
  it("routes an onboarding to the destination division's manager", () => {
    expect(resolveManager(onboarding, undefined).email).toBe("sarah.wijaya@example.com");
  });

  it("routes a movement to the DESTINATION manager, not the current one", () => {
    // The manager gaining the headcount is the one who has to want it.
    expect(resolveManager(movement, employee()).email).toBe("bagus.nugroho@example.com");
  });

  it("routes a termination to the CURRENT manager, since there is no destination", () => {
    expect(resolveManager(termination, employee()).email).toBe("sarah.wijaya@example.com");
  });

  it("normalises the address, so casing cannot create a second identity", () => {
    expect(resolveManager(onboarding, undefined).email).toBe("sarah.wijaya@example.com");
  });

  it("refuses a termination for an employee with no manager on record", () => {
    expect(() => resolveManager(termination, employee({ managerEmail: "" }))).toThrow(RoutingError);
  });

  it("refuses a termination when the employee cannot be found", () => {
    expect(() => resolveManager(termination, undefined)).toThrow(RoutingError);
  });
});

describe("which CISO approves", () => {
  it("uses the configured approver", () => {
    vi.stubEnv("CISO_APPROVER_EMAIL", "ciso@example.com");
    vi.stubEnv("CISO_APPROVER_NAME", "Dimas Anggara");

    expect(resolveCiso()).toEqual({ name: "Dimas Anggara", email: "ciso@example.com" });
  });

  it("falls back to the demo approver outside production", () => {
    vi.stubEnv("CISO_APPROVER_EMAIL", "");
    vi.stubEnv("NODE_ENV", "development");

    expect(resolveCiso().email).toBe("bagus.nugroho@example.com");
  });

  it("refuses to invent an approver in production", () => {
    // A request nobody is designated to approve must not be submittable.
    vi.stubEnv("CISO_APPROVER_EMAIL", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(() => resolveCiso()).toThrow(RoutingError);
  });
});

describe("separation of duties", () => {
  const hc: ActorIdentity = { name: "Ayu Prameswari", email: "ayu@example.com", userId: "ayu" };
  const manager: ActorIdentity = { name: "Sarah Wijaya", email: "sarah@example.com" };
  const ciso: ActorIdentity = { name: "Bagus Nugroho", email: "bagus@example.com" };

  it("accepts three distinct people", () => {
    expect(() => assertSeparationOfDuties(hc, { manager, ciso })).not.toThrow();
  });

  it("refuses a requester approving as the manager", () => {
    expect(() =>
      assertSeparationOfDuties(hc, { manager: { ...manager, email: hc.email }, ciso }),
    ).toThrow(SeparationOfDutiesError);
  });

  it("refuses a requester approving as the CISO", () => {
    expect(() =>
      assertSeparationOfDuties(hc, { manager, ciso: { ...ciso, email: hc.email } }),
    ).toThrow(SeparationOfDutiesError);
  });

  it("refuses one person holding both approvals", () => {
    expect(() => assertSeparationOfDuties(hc, { manager, ciso: { ...ciso, email: manager.email } })).toThrow(
      SeparationOfDutiesError,
    );
  });

  it("sees through a difference in casing or spacing", () => {
    expect(() =>
      assertSeparationOfDuties(hc, { manager: { ...manager, email: " AYU@example.com " }, ciso }),
    ).toThrow(SeparationOfDutiesError);
  });

  it("prefers the stable id over the address when both carry one", () => {
    // Two addresses, one account: still one person, and still not two approvals.
    const sameHuman: ActorIdentity = { name: "Ayu P.", email: "ayu.p@example.com", userId: "ayu" };
    expect(isSamePerson(hc, sameHuman)).toBe(true);
  });
});
