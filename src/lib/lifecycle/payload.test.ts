import { describe, expect, it } from "vitest";

import { canonicalJson, hashPayload, payloadMatches } from "./payload";
import type { MovementPayload, OnboardingPayload } from "./types";

function onboarding(overrides: Partial<OnboardingPayload> = {}): OnboardingPayload {
  return {
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
    managerEmail: "sarah.wijaya@example.com",
    startDate: "2026-10-01",
    accessProfileId: "engineering",
    ...overrides,
  };
}

describe("the fingerprint is stable for equal payloads", () => {
  it("does not depend on the order the object was built in", () => {
    // Two code paths producing the same request must agree, or a decision taken
    // on one would look like a decision on different text.
    const a: OnboardingPayload = onboarding();
    const b = {
      accessProfileId: "engineering",
      startDate: "2026-10-01",
      managerEmail: "sarah.wijaya@example.com",
      managerName: "Sarah Wijaya",
      locationType: "PUSAT",
      employmentType: "PERMANENT",
      department: "IT — Engineering",
      jobTitle: "Backend Engineer",
      email: "citra.wulandari@example.com",
      displayName: "Citra Wulandari",
      lastName: "Wulandari",
      firstName: "Citra",
      nik: "2026001",
      kind: "ONBOARDING",
    } as OnboardingPayload;

    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(hashPayload(a)).toBe(hashPayload(b));
  });

  it("treats an absent optional field and an explicitly undefined one as the same", () => {
    const absent = onboarding();
    const explicit = onboarding({ jobDescription: undefined });

    expect(hashPayload(absent)).toBe(hashPayload(explicit));
  });
});

describe("the fingerprint changes for different payloads", () => {
  it("notices a changed value", () => {
    expect(hashPayload(onboarding())).not.toBe(
      hashPayload(onboarding({ accessProfileId: "security" })),
    );
  });

  it("notices an added optional field", () => {
    expect(hashPayload(onboarding())).not.toBe(
      hashPayload(onboarding({ jobDescription: "Maintains the payments service." })),
    );
  });

  it("notices a whitespace-only difference, which a careless edit would produce", () => {
    expect(hashPayload(onboarding())).not.toBe(
      hashPayload(onboarding({ displayName: "Citra  Wulandari" })),
    );
  });

  it("distinguishes payloads of different kinds", () => {
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

    expect(hashPayload(movement)).not.toBe(hashPayload(onboarding()));
  });
});

describe("payloadMatches", () => {
  it("accepts the payload the hash was taken from", () => {
    const payload = onboarding();
    expect(payloadMatches(payload, hashPayload(payload))).toBe(true);
  });

  it("rejects a payload edited after the hash was taken", () => {
    const original = onboarding();
    const hash = hashPayload(original);
    const tampered = onboarding({ accessProfileId: "security" });

    expect(payloadMatches(tampered, hash)).toBe(false);
  });
});
