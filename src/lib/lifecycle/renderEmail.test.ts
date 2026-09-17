import { describe, expect, it } from "vitest";

import type { ApprovalMailPayload } from "./outbox";
import { renderEmail } from "./renderEmail";
import type { LifecyclePayload } from "./types";

/**
 * What an approval email actually contains.
 *
 * The rule worth a test rather than a comment: the termination note never
 * appears. It is an internal HC record of why somebody is leaving, and an
 * approver does not need it in order to decide. A comment saying so protects
 * nothing the first time somebody edits the template.
 */

function mail(overrides: Partial<ApprovalMailPayload> = {}): ApprovalMailPayload {
  return {
    kind: "approval.request",
    token: "token-abc",
    requestId: "lr_1",
    version: 1,
    type: "TERMINATION",
    stage: "MANAGER",
    subjectName: "Dewi Lestari",
    requesterName: "akmalardhia",
    approverName: "Akmal Ardhia",
    ...overrides,
  };
}

const TERMINATION: LifecyclePayload = {
  kind: "TERMINATION",
  employeeId: "emp_1",
  reasonCategory: "RESIGN",
  lastWorkingDate: "2027-01-30",
  handoverTo: "Yoga Pratama",
};

describe("what the approver can see", () => {
  it("carries the request itself, not only a summary and a link", () => {
    const message = renderEmail(mail({ payload: TERMINATION }), "a@b.com");

    expect(message.html).toContain("Mengundurkan diri");
    expect(message.html).toContain("2027-01-30");
    expect(message.html).toContain("Yoga Pratama");
  });

  it("uses the same wording as the portal summary", () => {
    // An approver reading the email and one reading the portal must be
    // deciding on the same text.
    const message = renderEmail(mail({ payload: TERMINATION }), "a@b.com");

    expect(message.html).toContain("Kategori alasan");
    expect(message.html).toContain("Tanggal terakhir bekerja");
  });

  it("resolves an access profile to its label rather than its id", () => {
    const onboarding: LifecyclePayload = {
      kind: "ONBOARDING",
      nik: "12345",
      firstName: "Budi",
      lastName: "Santoso",
      displayName: "Budi Santoso",
      email: "budi@example.com",
      jobTitle: "Engineer",
      department: "Engineering",
      employmentType: "PERMANENT",
      locationType: "PUSAT",
      managerName: "Sarah Wijaya",
      managerEmail: "sarah@example.com",
      startDate: "2026-10-01",
      accessProfileId: "engineering",
    };

    const message = renderEmail(mail({ type: "ONBOARDING", payload: onboarding }), "a@b.com");

    expect(message.html).toContain("Engineering");
    expect(message.html).not.toContain("accessProfileId");
  });

  it("says the same things on the card as in the body", () => {
    const message = renderEmail(mail({ payload: TERMINATION }), "a@b.com");
    const card = JSON.stringify(message.card);

    expect(card).toContain("Mengundurkan diri");
  });
});

describe("deciding from the inbox", () => {
  it("offers both decisions as separate links", () => {
    const message = renderEmail(mail({ payload: TERMINATION }), "a@b.com");

    expect(message.html).toContain("putusan=setuju");
    expect(message.html).toContain("putusan=tolak");
    expect(message.html).toContain(">Setujui<");
    expect(message.html).toContain(">Tolak<");
  });

  it("carries the token in the path, never in the query it advertises", () => {
    // The choice travels as a query parameter; the credential does not, so a
    // referrer or a proxy log that keeps query strings keeps nothing usable.
    const message = renderEmail(mail({ payload: TERMINATION }), "a@b.com");

    expect(message.html).toContain("/persetujuan/token-abc?putusan=setuju");
    expect(message.html).not.toContain("token=token-abc");
  });
});

describe("what never travels", () => {
  it("omits the termination note even when one is handed to it", () => {
    /*
     * outbox.ts strips this before the message is queued, so the renderer
     * should never receive one. This asserts the second line of defence: even
     * given a note, the template does not print it.
     */
    const withNote = { ...TERMINATION, note: "RAHASIA-INTERNAL-JANGAN-KIRIM" } as LifecyclePayload;
    const message = renderEmail(mail({ payload: withNote }), "a@b.com");

    expect(message.html).not.toContain("RAHASIA-INTERNAL-JANGAN-KIRIM");
    expect(JSON.stringify(message.card)).not.toContain("RAHASIA-INTERNAL-JANGAN-KIRIM");
  });
});

describe("a message queued before this field existed", () => {
  it("still renders, without the payload section", () => {
    // The dispatcher works through a backlog; an older sealed payload has no
    // `payload` field and must not crash the run.
    const message = renderEmail(mail(), "a@b.com");

    expect(message.html).toContain("Permintaan persetujuan");
    expect(message.html).not.toContain("Isi pengajuan");
  });
});
