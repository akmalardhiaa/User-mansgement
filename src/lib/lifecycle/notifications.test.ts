import { describe, expect, it } from "vitest";

import { notificationsFor } from "./notifications";
import { hashPayload } from "./payload";
import type { LifecycleRequest, LifecycleStatus, OnboardingPayload } from "./types";

/**
 * The header bell, from HC's side of the desk.
 *
 * Managers and the CISO team never sign in, so "waiting for your approval" is
 * a question no signed-in user can answer. What HC needs instead is what came
 * back and what nobody has answered — which is what these pin down.
 */

const NOW = Date.parse("2026-09-28T10:00:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW - hours * 60 * 60 * 1000).toISOString();

function request(
  name: string,
  status: LifecycleStatus,
  updatedAt: string,
): LifecycleRequest {
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
    subject: { displayName: payload.displayName, department: payload.department },
    payload,
    payloadHash: hashPayload(payload),
    approvals: [
      {
        stage: "MANAGER",
        version: 1,
        approver: { name: "Sarah Wijaya", email: "sarah.wijaya@example.com" },
      },
    ],
    policyVersion: "2026-09-16.1",
    createdAt: updatedAt,
    updatedAt,
  };
}

describe("what the bell reports", () => {
  it("reports an approval nobody has answered for a day", () => {
    const feed = notificationsFor([request("Lama", "PENDING_CISO", hoursAgo(50))], NOW);

    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({
      kind: "WAITING_TOO_LONG",
      stage: "CISO",
      waitingHours: 50,
      subjectName: "Lama Test",
      department: "Finance",
    });
    expect(feed.needsAttention).toBe(1);
  });

  it("stays quiet about one that was only just submitted", () => {
    const feed = notificationsFor([request("Baru", "PENDING_MANAGER", hoursAgo(3))], NOW);

    expect(feed.items).toEqual([]);
    expect(feed.needsAttention).toBe(0);
  });

  it("reports a failed execution, however long ago it failed", () => {
    const feed = notificationsFor([request("Gagal", "FAILED", hoursAgo(1000))], NOW);

    expect(feed.items[0]).toMatchObject({ kind: "FAILED" });
    expect(feed.needsAttention).toBe(1);
  });

  it("mentions what finished or was rejected recently, without lighting the badge", () => {
    const feed = notificationsFor(
      [
        request("Selesai", "COMPLETED", hoursAgo(5)),
        request("Ditolak", "REJECTED", hoursAgo(5)),
      ],
      NOW,
    );

    expect(feed.items.map((item) => item.kind)).toEqual(["REJECTED", "COMPLETED"]);
    // News, not work: nothing here is waiting on anybody.
    expect(feed.needsAttention).toBe(0);
  });

  it("lets old news drop off", () => {
    const feed = notificationsFor(
      [
        request("Selesai", "COMPLETED", hoursAgo(72)),
        request("Ditolak", "REJECTED", hoursAgo(100)),
      ],
      NOW,
    );

    expect(feed.items).toEqual([]);
  });

  it("leaves out drafts, cancellations and requests mid-flight", () => {
    const feed = notificationsFor(
      [
        request("Draf", "DRAFT", hoursAgo(200)),
        request("Batal", "CANCELLED", hoursAgo(1)),
        request("Jalan", "EXECUTING", hoursAgo(1)),
        request("Antre", "QUEUED", hoursAgo(1)),
      ],
      NOW,
    );

    expect(feed.items).toEqual([]);
  });

  it("puts the most urgent first, and the longest wait first within a kind", () => {
    const feed = notificationsFor(
      [
        request("Selesai", "COMPLETED", hoursAgo(2)),
        request("Menunggu30", "PENDING_MANAGER", hoursAgo(30)),
        request("Gagal", "FAILED", hoursAgo(4)),
        request("Menunggu80", "PENDING_CISO", hoursAgo(80)),
      ],
      NOW,
    );

    expect(feed.items.map((item) => item.subjectName)).toEqual([
      "Gagal Test",
      "Menunggu80 Test",
      "Menunggu30 Test",
      "Selesai Test",
    ]);
    expect(feed.needsAttention).toBe(3);
  });

  it("caps the list at a dozen", () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      request(`Lama${index}`, "PENDING_MANAGER", hoursAgo(30 + index)),
    );

    const feed = notificationsFor(many, NOW);

    expect(feed.items).toHaveLength(12);
    expect(feed.total).toBe(12);
  });
});
