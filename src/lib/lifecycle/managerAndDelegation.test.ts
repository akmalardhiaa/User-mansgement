import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PortalSession } from "@/lib/auth/session";
import type { StoreShape } from "@/lib/db/store";

import { activeDelegationFor, dayEnd, dayStart, refusalFor, type Delegation } from "./delegation";
import { createDelegation, endDelegation } from "./delegationService";
import type { ApprovalMailPayload } from "./outbox";
import { open } from "./outboxCrypto";
import { renderEmail } from "./renderEmail";
import { SeparationOfDutiesError } from "./routing";
import {
  LifecycleError,
  createDraft,
  decideByToken,
  previewByToken,
  submitRequest,
} from "./service";
import type { ActorIdentity, OnboardingPayload, TerminationPayload } from "./types";

/**
 * Who may be an approver: the named manager must come from the directory, and a
 * manager who is away may hand their approvals to a substitute — without that
 * becoming a way around separation of duties.
 */

let workspace: string;
let storePath: string;

function hc(userId: string, email: string, fullName: string): PortalSession {
  return {
    userId,
    username: userId,
    email,
    fullName,
    roles: ["HC_REQUESTER"],
    createdAt: "2026-09-16T00:00:00.000Z",
    absoluteExpiresAt: "2026-09-17T00:00:00.000Z",
  };
}

const AYU = hc("ayu", "ayu.prameswari@example.com", "Ayu Prameswari");
const BAGUS = hc("bagus", "bagus.nugroho@example.com", "Bagus Nugroho");
/** Rizky's own manager, holding the HC role. */
const SARAH_AS_HC = hc("sarah", "sarah.wijaya@example.com", "Sarah Wijaya");

/** Seed roster: Rizky reports to Sarah; Yoga is active; Clara is disabled. */
const TERMINATION: TerminationPayload = {
  kind: "TERMINATION",
  employeeId: "emp_seed_002",
  reasonCategory: "RESIGN",
  lastWorkingDate: "2026-10-31",
};

const ONBOARDING: OnboardingPayload = {
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
};

function jakartaDate(offsetDays = 0): string {
  const at = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(at);
}

function sarahToYoga(extra: { reroutePending?: boolean; startOffset?: number } = {}) {
  return {
    fromEmail: "sarah.wijaya@example.com",
    toEmail: "yoga.pratama@example.com",
    startDate: jakartaDate(extra.startOffset ?? 0),
    endDate: jakartaDate((extra.startOffset ?? 0) + 5),
    reason: "Cuti tahunan",
    reroutePending: extra.reroutePending ?? false,
  };
}

async function raise(payload: TerminationPayload | OnboardingPayload, session = AYU) {
  const draft = await createDraft({ payload }, session);
  return submitRequest(draft.id, draft.version, session);
}

async function store(): Promise<StoreShape> {
  return JSON.parse(await readFile(storePath, "utf8")) as StoreShape;
}

async function managerMails(): Promise<Array<{ to: string; payload: ApprovalMailPayload }>> {
  const { outboxEvents } = await store();
  return outboxEvents
    .filter((event) => event.kind === "approval.request" && event.stage === "MANAGER")
    .map((event) => ({
      to: event.recipient,
      payload: JSON.parse(open(event.sealedPayload!)) as ApprovalMailPayload,
    }));
}

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "hc-delegation-"));
  storePath = path.join(workspace, "store.json");
  vi.stubEnv("HC_DATA_FILE", storePath);
  vi.stubEnv("CISO_APPROVER_EMAIL", "ciso@example.com");
  vi.stubEnv("CISO_APPROVER_NAME", "Tim CISO");
  vi.stubEnv("CISO_APPROVER_EMAILS", "");
  vi.stubEnv("CISO_APPROVER_GROUP", "");
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(workspace, { recursive: true, force: true });
});

describe("the manager a request names", () => {
  it("cannot be an address the requester typed", async () => {
    await expect(
      createDraft({ payload: { ...ONBOARDING, managerEmail: "teman.saya@gmail.com" } }, AYU),
    ).rejects.toThrow(/Manager harus karyawan aktif/);
  });

  it("cannot be someone whose account is disabled", async () => {
    await expect(
      createDraft({ payload: { ...ONBOARDING, managerEmail: "clara.halim@example.com" } }, AYU),
    ).rejects.toThrow(/tidak aktif/);
  });

  it("carries the directory's name, not the one that was typed beside the address", async () => {
    const request = await raise({ ...ONBOARDING, managerName: "Orang Lain" });

    expect(request.approvals[0].approver).toMatchObject({
      name: "Sarah Wijaya",
      email: "sarah.wijaya@example.com",
    });
  });

  it("applies to a Movement's destination manager too", async () => {
    await expect(
      createDraft(
        {
          payload: {
            kind: "MOVEMENT",
            employeeId: "emp_seed_002",
            toDepartment: "IT — Security",
            toJobTitle: "Security Engineer",
            toManagerName: "Siapa Saja",
            toManagerEmail: "siapa.saja@yahoo.com",
            accessProfileId: "security",
            reason: "Rotasi internal.",
          },
        },
        AYU,
      ),
    ).rejects.toThrow(LifecycleError);
  });
});

describe("the rules a delegation is held to", () => {
  const at = new Date("2026-10-01T03:00:00.000Z");
  const sarah: ActorIdentity = { name: "Sarah", email: "sarah@example.com" };
  const yoga: ActorIdentity = { name: "Yoga", email: "yoga@example.com" };
  const budi: ActorIdentity = { name: "Budi", email: "budi@example.com" };

  function existing(from: ActorIdentity, to: ActorIdentity): Delegation {
    return {
      id: "dlg_1",
      from,
      to,
      startsAt: dayStart("2026-10-01"),
      endsAt: dayEnd("2026-10-10"),
      reason: "Cuti",
      createdBy: { name: "HC", email: "hc@example.com" },
      createdAt: at.toISOString(),
    };
  }

  const window = { startsAt: dayStart("2026-10-05"), endsAt: dayEnd("2026-10-08") };

  it("refuses delegating to oneself, backwards dates, the past, and more than 90 days", () => {
    expect(refusalFor({ from: sarah, to: sarah, ...window }, [], at)).toMatch(/dirinya sendiri/);
    expect(
      refusalFor({ from: sarah, to: yoga, startsAt: window.endsAt, endsAt: window.startsAt }, [], at),
    ).toMatch(/sebelum tanggal mulai/);
    expect(
      refusalFor({ from: sarah, to: yoga, startsAt: dayStart("2026-09-01"), endsAt: dayEnd("2026-09-02") }, [], at),
    ).toMatch(/sudah lewat/);
    expect(
      refusalFor({ from: sarah, to: yoga, startsAt: dayStart("2026-10-01"), endsAt: dayEnd("2027-03-01") }, [], at),
    ).toMatch(/90 hari/);
  });

  it("refuses a second delegation for the same manager over the same days", () => {
    expect(refusalFor({ from: sarah, to: budi, ...window }, [existing(sarah, yoga)], at)).toMatch(
      /sudah punya delegasi/,
    );
  });

  it("refuses chains, in both directions", () => {
    // Yoga is away himself, so he cannot cover for Sarah.
    expect(refusalFor({ from: sarah, to: yoga, ...window }, [existing(yoga, budi)], at)).toMatch(
      /sedang didelegasikan/,
    );
    // Sarah is covering for Yoga, so she cannot hand that on to Budi.
    expect(refusalFor({ from: sarah, to: budi, ...window }, [existing(yoga, sarah)], at)).toMatch(
      /berantai/,
    );
  });

  it("covers only its own days, and stops when HC ends it", () => {
    const delegation = existing(sarah, yoga);
    expect(activeDelegationFor([delegation], "SARAH@example.com", at)).toBeDefined();
    expect(activeDelegationFor([delegation], "sarah@example.com", new Date("2026-10-11T00:00:00Z"))).toBeUndefined();

    const ended = { ...delegation, endedAt: "2026-10-02T00:00:00.000Z" };
    expect(activeDelegationFor([ended], "sarah@example.com", new Date("2026-10-03T00:00:00Z"))).toBeUndefined();
  });
});

describe("registering a delegation", () => {
  it("refuses an HC officer appointing themselves", async () => {
    await expect(
      createDelegation({ ...sarahToYoga(), toEmail: "ayu.prameswari@example.com" }, AYU),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a substitute who is not an active employee", async () => {
    await expect(
      createDelegation({ ...sarahToYoga(), toEmail: "clara.halim@example.com" }, AYU),
    ).rejects.toThrow(/karyawan aktif/);
  });

  it("refuses to move waiting requests for a delegation that has not started", async () => {
    await expect(
      createDelegation(sarahToYoga({ reroutePending: true, startOffset: 3 }), AYU),
    ).rejects.toThrow(/sudah berlaku hari ini/);
  });
});

describe("a request raised while the manager is away", () => {
  it("goes to the substitute, and says on whose behalf", async () => {
    await createDelegation(sarahToYoga(), BAGUS);
    const request = await raise(TERMINATION);

    expect(request.approvals[0]).toMatchObject({
      approver: { email: "yoga.pratama@example.com" },
      onBehalfOf: { email: "sarah.wijaya@example.com" },
    });

    const [mail] = await managerMails();
    expect(mail.to).toBe("yoga.pratama@example.com");
    expect(renderEmail(mail.payload, mail.to).html).toContain("pengganti Sarah Wijaya");

    await decideByToken(mail.payload.token!, { decision: "APPROVED" });
    const { auditEvents } = await store();
    expect(auditEvents.find((event) => event.action === "request.approved")?.actorName).toBe(
      "Yoga Pratama (atas nama Sarah Wijaya)",
    );
  });

  it("is still refused when the requester IS the absent manager", async () => {
    // Being "away" must not be a way to have your own request approved.
    await createDelegation(sarahToYoga(), BAGUS);
    await expect(raise(TERMINATION, SARAH_AS_HC)).rejects.toThrow(SeparationOfDutiesError);
  });

  it("is refused when the substitute is the requester", async () => {
    await createDelegation({ ...sarahToYoga(), toEmail: "ayu.prameswari@example.com" }, BAGUS);
    await expect(raise(TERMINATION, AYU)).rejects.toThrow(SeparationOfDutiesError);
  });

  it("goes back to the manager once the delegation is ended", async () => {
    const { delegation } = await createDelegation(sarahToYoga(), BAGUS);
    await endDelegation(delegation.id, BAGUS);

    const request = await raise(TERMINATION);
    expect(request.approvals[0].approver.email).toBe("sarah.wijaya@example.com");
    expect(request.approvals[0].onBehalfOf).toBeUndefined();
  });
});

describe("moving requests already waiting on the manager", () => {
  it("only when asked, killing the manager's link and sending the substitute a new one", async () => {
    const request = await raise(TERMINATION);
    const [sarahMail] = await managerMails();

    const { reroute } = await createDelegation(sarahToYoga({ reroutePending: true }), BAGUS);
    expect(reroute?.rerouted).toEqual([request.id]);

    await expect(decideByToken(sarahMail.payload.token!, { decision: "APPROVED" })).rejects.toThrow(
      /dialihkan ke pengganti/,
    );

    const yogaMail = (await managerMails()).find((mail) => mail.to === "yoga.pratama@example.com")!;
    const decided = await decideByToken(yogaMail.payload.token!, { decision: "APPROVED" });
    expect(decided.status).toBe("PENDING_CISO");
    // Nothing about what was approved changed: same version, same fingerprint.
    expect(decided.version).toBe(1);
    expect(decided.payloadHash).toBe(request.payloadHash);
  });

  it("skips — and reports — a request the substitute raised themselves", async () => {
    await raise(TERMINATION, AYU);
    const [sarahMail] = await managerMails();

    const { reroute } = await createDelegation(
      { ...sarahToYoga({ reroutePending: true }), toEmail: "ayu.prameswari@example.com" },
      BAGUS,
    );

    expect(reroute?.rerouted).toEqual([]);
    expect(reroute?.skipped).toHaveLength(1);
    // Left with Sarah, whose link still works.
    expect((await previewByToken(sarahMail.payload.token!)).ok).toBe(true);
  });

  it("does not happen when the option is not ticked", async () => {
    await raise(TERMINATION);
    const { reroute } = await createDelegation(sarahToYoga(), BAGUS);

    expect(reroute).toBeUndefined();
    expect((await managerMails()).map((mail) => mail.to)).toEqual(["sarah.wijaya@example.com"]);
  });
});
