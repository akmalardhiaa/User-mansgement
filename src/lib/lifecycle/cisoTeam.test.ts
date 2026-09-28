import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PortalSession } from "@/lib/auth/session";
import type { StoreShape } from "@/lib/db/store";

import type { ApprovalMailPayload } from "./outbox";
import { open } from "./outboxCrypto";
import { renderEmail } from "./renderEmail";
import {
  RoutingError,
  SeparationOfDutiesError,
  assertSeparationOfDuties,
  resolveCisoTeam,
} from "./routing";
import { createDraft, decideByToken, previewByToken, submitRequest } from "./service";
import type { ActorIdentity, TerminationPayload } from "./types";

/**
 * The CISO stage, sent to a team.
 *
 * Every member gets their own email and their own link; the first answer
 * decides; every other member's link dies in the same transaction and, when
 * opened, says who decided instead of reporting a broken link.
 */

let workspace: string;
let storePath: string;

const HC: PortalSession = {
  userId: "ayu",
  username: "ayu",
  email: "ayu.prameswari@example.com",
  fullName: "Ayu Prameswari",
  roles: ["HC_REQUESTER"],
  createdAt: "2026-09-16T00:00:00.000Z",
  absoluteExpiresAt: "2026-09-17T00:00:00.000Z",
};

/** Rizky, from the seed roster. His manager of record is Sarah. */
const TERMINATION: TerminationPayload = {
  kind: "TERMINATION",
  employeeId: "emp_seed_002",
  reasonCategory: "RESIGN",
  lastWorkingDate: "2026-10-31",
};

const TEAM = "Rina <rina.ciso@example.com>, Budi <budi.ciso@example.com>, Sari <sari.ciso@example.com>";

async function store(): Promise<StoreShape> {
  return JSON.parse(await readFile(storePath, "utf8")) as StoreShape;
}

async function mails(stage: "MANAGER" | "CISO"): Promise<Array<{ to: string; payload: ApprovalMailPayload }>> {
  const { outboxEvents } = await store();
  return outboxEvents
    .filter((event) => event.kind === "approval.request" && event.stage === stage)
    .map((event) => ({
      to: event.recipient,
      payload: JSON.parse(open(event.sealedPayload!)) as ApprovalMailPayload,
    }));
}

async function linkFor(address: string): Promise<string> {
  const found = (await mails("CISO")).find((mail) => mail.to === address);
  return found!.payload.token!;
}

/** Raised, and approved by the manager from her email — so the CISO stage is live. */
async function atCisoStage() {
  const draft = await createDraft({ payload: TERMINATION }, HC);
  const request = await submitRequest(draft.id, draft.version, HC);
  const [managerMail] = await mails("MANAGER");
  await decideByToken(managerMail.payload.token!, { decision: "APPROVED" });
  return request;
}

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "hc-ciso-team-"));
  storePath = path.join(workspace, "store.json");
  vi.stubEnv("HC_DATA_FILE", storePath);
  vi.stubEnv("CISO_APPROVER_EMAILS", TEAM);
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(workspace, { recursive: true, force: true });
});

describe("who is on the team", () => {
  it("reads names and addresses, and lists nobody twice", () => {
    vi.stubEnv("CISO_APPROVER_EMAILS", `${TEAM}, BUDI.ciso@example.com`);

    expect(resolveCisoTeam()).toEqual([
      { name: "Rina", email: "rina.ciso@example.com" },
      { name: "Budi", email: "budi.ciso@example.com" },
      { name: "Sari", email: "sari.ciso@example.com" },
    ]);
  });

  it("refuses a mistyped member rather than silently never emailing them", () => {
    vi.stubEnv("CISO_APPROVER_EMAILS", "Rina <rina.ciso@example.com>, budi-at-example.com");
    expect(() => resolveCisoTeam()).toThrow(RoutingError);
  });

  it("falls back to the single configured approver as a team of one", () => {
    vi.stubEnv("CISO_APPROVER_EMAILS", "");
    vi.stubEnv("CISO_APPROVER_EMAIL", "ciso@example.com");
    expect(resolveCisoTeam()).toEqual([{ name: "ciso@example.com", email: "ciso@example.com" }]);
  });
});

describe("separation of duties, for a team", () => {
  const manager: ActorIdentity = { name: "Sarah", email: "sarah.wijaya@example.com" };
  const team = resolveCisoTeamFrom(TEAM);

  it("leaves out a member who raised the request, instead of refusing it", () => {
    const requester: ActorIdentity = { name: "Rina", email: "rina.ciso@example.com" };
    const eligible = assertSeparationOfDuties(requester, { manager, ciso: team });
    expect(eligible.map((member) => member.name)).toEqual(["Budi", "Sari"]);
  });

  it("leaves out a member who is also the manager on it", () => {
    const eligible = assertSeparationOfDuties(HC_ID, { manager: team[1], ciso: team });
    expect(eligible.map((member) => member.name)).toEqual(["Rina", "Sari"]);
  });

  it("refuses the request only when nobody on the team is left", () => {
    const requester = team[0];
    expect(() => assertSeparationOfDuties(requester, { manager, ciso: [team[0]] })).toThrow(
      SeparationOfDutiesError,
    );
  });
});

describe("sending to the team", () => {
  it("gives every member their own email and their own link, once the manager has approved", async () => {
    const request = await atCisoStage();

    const sent = await mails("CISO");
    expect(sent.map((mail) => mail.to).sort()).toEqual([
      "budi.ciso@example.com",
      "rina.ciso@example.com",
      "sari.ciso@example.com",
    ]);
    // Three different links, not one shared one.
    expect(new Set(sent.map((mail) => mail.payload.token)).size).toBe(3);

    const { lifecycleRequests, approvalTokens } = await store();
    const step = lifecycleRequests.find((r) => r.id === request.id)!.approvals[1];
    expect(step.pool).toHaveLength(3);
    expect(
      approvalTokens.filter((token) => token.stage === "CISO").map((token) => token.recipient).sort(),
    ).toEqual(["budi.ciso@example.com", "rina.ciso@example.com", "sari.ciso@example.com"]);
  });

  it("tells each member it went to the team and the first answer counts", async () => {
    await atCisoStage();
    const [mail] = await mails("CISO");

    const rendered = renderEmail(mail.payload, mail.to);
    expect(rendered.html).toContain("3 anggota tim CISO");
    expect(rendered.html).toContain("Keputusan pertama yang masuk yang berlaku");
  });
});

describe("the first answer decides", () => {
  it("credits the member whose link was used, and kills everyone else's", async () => {
    const request = await atCisoStage();

    const decided = await decideByToken(await linkFor("budi.ciso@example.com"), {
      decision: "APPROVED",
    });
    expect(decided.status).toBe("QUEUED");
    expect(decided.approvals[1].decidedBy?.name).toBe("Budi");

    // Rina's link is dead — and says who decided, rather than "invalid link".
    const rina = await linkFor("rina.ciso@example.com");
    await expect(decideByToken(rina, { decision: "APPROVED" })).rejects.toThrow(
      /Sudah disetujui oleh Budi/,
    );
    const preview = await previewByToken(rina);
    expect(preview).toMatchObject({ ok: false, settled: true });

    const { approvalTokens } = await store();
    const live = approvalTokens.filter(
      (token) => token.requestId === request.id && !token.revokedAt && !token.consumedAt,
    );
    expect(live).toHaveLength(0);
  });

  it("lets one member's rejection end it for the whole team", async () => {
    await atCisoStage();

    const rejected = await decideByToken(await linkFor("sari.ciso@example.com"), {
      decision: "REJECTED",
      reason: "Akses belum dikaji ulang.",
    });
    expect(rejected.status).toBe("REJECTED");

    await expect(
      decideByToken(await linkFor("budi.ciso@example.com"), { decision: "APPROVED" }),
    ).rejects.toThrow(/Sudah ditolak oleh Sari/);
  });

  it("records exactly one decision when two members answer at the same moment", async () => {
    await atCisoStage();
    const [budi, sari] = await Promise.all([
      linkFor("budi.ciso@example.com"),
      linkFor("sari.ciso@example.com"),
    ]);

    const results = await Promise.allSettled([
      decideByToken(budi, { decision: "APPROVED" }),
      decideByToken(sari, { decision: "APPROVED" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const { auditEvents } = await store();
    const cisoDecisions = auditEvents.filter(
      (event) => event.action === "request.approved" && event.detail?.stage === "CISO",
    );
    expect(cisoDecisions).toHaveLength(1);
  });

  it("never emails a member who raised the request", async () => {
    vi.stubEnv("CISO_APPROVER_EMAILS", `${TEAM}, Ayu <ayu.prameswari@example.com>`);
    await atCisoStage();

    expect((await mails("CISO")).map((mail) => mail.to)).not.toContain("ayu.prameswari@example.com");
  });
});

describe("links issued before teams existed", () => {
  it("still decide, credited to the approver they were addressed to", async () => {
    vi.stubEnv("CISO_APPROVER_EMAILS", "");
    vi.stubEnv("CISO_APPROVER_EMAIL", "ciso@example.com");
    vi.stubEnv("CISO_APPROVER_NAME", "Dimas Anggara");
    await atCisoStage();
    const link = (await mails("CISO"))[0].payload.token!;

    // A token record from before `recipient` existed.
    const saved = await store();
    for (const token of saved.approvalTokens) delete token.recipient;
    await writeFile(storePath, JSON.stringify(saved), "utf8");

    const decided = await decideByToken(link, { decision: "APPROVED" });
    expect(decided.approvals[1].decidedBy?.email).toBe("ciso@example.com");
  });
});

/* Fixtures that need the environment only at call time. */

const HC_ID: ActorIdentity = { name: "Ayu Prameswari", email: "ayu.prameswari@example.com", userId: "ayu" };

function resolveCisoTeamFrom(list: string): ActorIdentity[] {
  const previous = process.env.CISO_APPROVER_EMAILS;
  process.env.CISO_APPROVER_EMAILS = list;
  try {
    return resolveCisoTeam();
  } finally {
    process.env.CISO_APPROVER_EMAILS = previous;
  }
}
