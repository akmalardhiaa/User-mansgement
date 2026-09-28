import { describe, expect, it } from "vitest";

import { hashPayload } from "./payload";
import { onboardingsInFlight } from "./pending";
import type { LifecycleRequest, LifecycleStatus, OnboardingPayload } from "./types";

/**
 * People being onboarded, as the dashboard shows them before they have an
 * account: from the moment the request is raised until the worker has made it.
 */

function onboarding(name: string, status: LifecycleStatus, createdAt: string): LifecycleRequest {
  const payload: OnboardingPayload = {
    kind: "ONBOARDING",
    firstName: name,
    lastName: "Test",
    displayName: `${name} Test`,
    email: `${name.toLowerCase()}@example.com`,
    jobTitle: "Analyst",
    department: "Finance",
    employmentType: "PERMANENT",
    locationType: "PUSAT",
    managerName: "Sarah Wijaya",
    managerEmail: "sarah.wijaya@example.com",
    startDate: "2026-10-01",
    accessProfileId: "standard",
  };
  return {
    id: `lr_${name}`,
    type: "ONBOARDING",
    version: 1,
    status,
    requester: { name: "Ayu", email: "ayu@example.com", userId: "ayu" },
    subject: { displayName: payload.displayName },
    payload,
    payloadHash: hashPayload(payload),
    approvals: [{ stage: "MANAGER", version: 1, approver: { name: "Sarah Wijaya", email: "sarah.wijaya@example.com" } }],
    policyVersion: "2026-09-16.1",
    createdAt,
    updatedAt: createdAt,
  };
}

describe("onboardings in flight", () => {
  it("includes everyone raised and not yet finished, newest first", () => {
    const shown = onboardingsInFlight([
      onboarding("Awal", "PENDING_MANAGER", "2026-09-20T00:00:00.000Z"),
      onboarding("Baru", "PENDING_CISO", "2026-09-22T00:00:00.000Z"),
      onboarding("Siap", "QUEUED", "2026-09-21T00:00:00.000Z"),
    ]);

    expect(shown.map((item) => item.displayName)).toEqual(["Baru Test", "Siap Test", "Awal Test"]);
    expect(shown[0]).toMatchObject({ status: "PENDING_CISO", managerName: "Sarah Wijaya" });
  });

  it("leaves out what has finished, failed for good, or been withdrawn", () => {
    // A completed one is in the directory table now; the others never will be.
    const shown = onboardingsInFlight([
      onboarding("Selesai", "COMPLETED", "2026-09-20T00:00:00.000Z"),
      onboarding("Ditolak", "REJECTED", "2026-09-20T00:00:00.000Z"),
      onboarding("Batal", "CANCELLED", "2026-09-20T00:00:00.000Z"),
    ]);

    expect(shown).toEqual([]);
  });

  it("keeps a failed execution visible, because somebody has to look at it", () => {
    const [item] = onboardingsInFlight([onboarding("Gagal", "FAILED", "2026-09-20T00:00:00.000Z")]);
    expect(item.status).toBe("FAILED");
  });
});
