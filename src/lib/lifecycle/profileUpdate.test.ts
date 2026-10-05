import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAdDriver } from "@/lib/ad";
import { installTestDirectory, type TestAccount } from "@/lib/ad/testDirectory";
import type { PortalSession } from "@/lib/auth/session";
import type { StoreShape } from "@/lib/db/store";
import { parseLifecycleRequestInput } from "@/lib/validation/lifecycleRequestInput";

import { accessProfileGroups, accessProfileOu, quarantineOu } from "./accessProfiles";
import type { ApprovalMailPayload } from "./outbox";
import { open } from "./outboxCrypto";
import { buildPlan } from "./plan";
import { REDACTED_VALUE, diffProfile } from "./profileUpdate";
import { renderEmail } from "./renderEmail";
import { SeparationOfDutiesError } from "./routing";
import { LifecycleError, createDraft, decide, submitRequest } from "./service";
import type { ProfileFields, ProfileUpdatePayload } from "./types";
import { runDueJobs } from "./worker";

/**
 * Editing a profile, as a request.
 *
 * What these pin down is everything that used to be missing when the edit was
 * a direct write: nobody approved it, a department change skipped the manager,
 * and the directory was told something Active Directory never heard about.
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

const MANAGER: PortalSession = {
  ...HC,
  userId: "sarah",
  username: "sarah",
  email: "sarah.wijaya@example.com",
  fullName: "Sarah Wijaya",
  roles: [],
};

/** Sarah again, but holding the HC role — Rizky's own manager raising his edit. */
const MANAGER_AS_HC: PortalSession = { ...MANAGER, roles: ["HC_REQUESTER"] };

const CISO: PortalSession = {
  ...HC,
  userId: "ciso",
  username: "ciso",
  email: "ciso@example.com",
  fullName: "Dimas Anggara",
  roles: [],
};

/** Rizky, from the seed roster. His manager of record is Sarah. */
const RIZKY = "emp_seed_002";
/** Canonical, the form the directory hands out. */
const RIZKY_GUID = "4b0c7a62-7a6e-4c1e-9a43-3f6a1d2b5e10";

const RIZKY_NOW: ProfileFields = {
  firstName: "Rizky",
  lastName: "Maulana",
  displayName: "Rizky Maulana",
  jobTitle: "Senior Backend Engineer",
  department: "IT — Engineering",
};

function update(
  profile: Partial<ProfileFields> = {},
  extra: Partial<ProfileUpdatePayload> = {},
): ProfileUpdatePayload {
  return {
    kind: "PROFILE_UPDATE",
    employeeId: RIZKY,
    profile: { ...RIZKY_NOW, ...profile },
    changes: [],
    ...extra,
  };
}

async function raise(payload: ProfileUpdatePayload, session: PortalSession = HC) {
  const draft = await createDraft({ payload }, session);
  return submitRequest(draft.id, draft.version, session);
}

async function store(): Promise<StoreShape> {
  return JSON.parse(await readFile(storePath, "utf8")) as StoreShape;
}

async function queuedMail(stage: "MANAGER" | "CISO"): Promise<{ raw: string; payload: ApprovalMailPayload }> {
  const { outboxEvents } = await store();
  const event = outboxEvents.find(
    (candidate) => candidate.kind === "approval.request" && candidate.stage === stage,
  );
  const raw = open(event!.sealedPayload!);
  return { raw, payload: JSON.parse(raw) as ApprovalMailPayload };
}

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "hc-profile-"));
  storePath = path.join(workspace, "store.json");
  vi.stubEnv("HC_DATA_FILE", storePath);
  vi.stubEnv("CISO_APPROVER_EMAIL", "ciso@example.com");
  vi.stubEnv("CISO_APPROVER_NAME", "Dimas Anggara");
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  resetAdDriver();
  await rm(workspace, { recursive: true, force: true });
});

describe("the diff", () => {
  it("reports only what changed, in words an approver reads", () => {
    const changes = diffProfile(RIZKY_NOW, {
      ...RIZKY_NOW,
      department: "Finance",
      employmentType: "CONTRACT",
      expiredDate: "2027-01-31",
    });

    expect(changes).toEqual([
      { field: "department", label: "Departemen", from: "IT — Engineering", to: "Finance" },
      { field: "employmentType", label: "Status kepegawaian", from: "—", to: "Temporary" },
      { field: "expiredDate", label: "Tanggal terakhir bekerja", from: "—", to: "2027-01-31" },
    ]);
  });

  it("does not report a change nobody made when a date is stored as a timestamp", () => {
    const before = { ...RIZKY_NOW, employmentType: "CONTRACT" as const, expiredDate: "2027-01-31T00:00:00.000Z" };
    expect(diffProfile(before, { ...before, expiredDate: "2027-01-31" })).toEqual([]);
  });
});

describe("validating the form", () => {
  it("ignores a diff supplied by the browser", () => {
    const parsed = parseLifecycleRequestInput({
      type: "PROFILE_UPDATE",
      employeeId: RIZKY,
      ...RIZKY_NOW,
      department: "Finance",
      changes: [{ field: "department", label: "Departemen", from: "karangan", to: "karangan" }],
    });

    expect(parsed.ok).toBe(true);
    if (parsed.ok && parsed.value.payload.kind === "PROFILE_UPDATE") {
      expect(parsed.value.payload.changes).toEqual([]);
      expect(parsed.value.payload.profile.department).toBe("Finance");
    }
  });

  it("requires the employee and an end date for a contract", () => {
    const parsed = parseLifecycleRequestInput({
      type: "PROFILE_UPDATE",
      ...RIZKY_NOW,
      employmentType: "CONTRACT",
    });

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors.employeeId).toBeTruthy();
      expect(parsed.errors.expiredDate).toBeTruthy();
    }
  });
});

describe("raising a profile update", () => {
  it("computes the diff on the server, against the record — not the one it was sent", async () => {
    const request = await raise(
      update(
        { department: "IT — Security" },
        { changes: [{ field: "department", label: "Departemen", from: "palsu", to: "palsu" }] },
      ),
    );

    expect(request.payload.kind === "PROFILE_UPDATE" && request.payload.changes).toEqual([
      { field: "department", label: "Departemen", from: "IT — Engineering", to: "IT — Security" },
    ]);
  });

  it("is refused when it changes nothing", async () => {
    await expect(createDraft({ payload: update() }, HC)).rejects.toThrow(/Tidak ada perubahan/);
  });

  it("goes to the employee's current manager, then the CISO", async () => {
    const request = await raise(update({ jobTitle: "Staff Backend Engineer" }));

    expect(request.status).toBe("PENDING_MANAGER");
    expect(request.approvals.map((step) => step.approver.email)).toEqual([
      "sarah.wijaya@example.com",
      "ciso@example.com",
    ]);
  });

  it("leaves the directory record exactly as it was until it is executed", async () => {
    await raise(update({ department: "Finance" }));

    const { employees } = await store();
    expect(employees.find((employee) => employee.id === RIZKY)?.department).toBe("IT — Engineering");
  });

  it("refuses a requester who is also the employee's manager", async () => {
    // Sarah would otherwise be approving an edit she asked for herself.
    await expect(raise(update({ department: "Finance" }), MANAGER_AS_HC)).rejects.toThrow(
      SeparationOfDutiesError,
    );
  });

  it("refuses a second live request for the same employee", async () => {
    await raise(update({ department: "Finance" }));

    await expect(createDraft({ payload: update({ jobTitle: "Lead" }) }, HC)).rejects.toThrow(
      LifecycleError,
    );
  });
});

describe("the approval email", () => {
  it("shows before and after, and keeps the HC note out of the queue entirely", async () => {
    await raise(update({ department: "IT — Security", description: "Rahasia: hasil evaluasi kinerja" }));

    const { raw, payload } = await queuedMail("MANAGER");

    // Not merely hidden by the template: absent from what was queued.
    expect(raw).not.toContain("evaluasi kinerja");
    const changes = payload.payload?.kind === "PROFILE_UPDATE" ? payload.payload.changes : [];
    expect(changes.find((change) => change.field === "description")?.to).toBe(REDACTED_VALUE);

    const mail = renderEmail(payload, "sarah.wijaya@example.com");
    expect(mail.subject).toContain("Perubahan Profil");
    expect(mail.html).toContain("IT — Engineering → IT — Security");
    expect(mail.html).not.toContain("evaluasi kinerja");
  });
});

describe("executing it", () => {
  it("writes only the attributes, and pins enabled state, OU and groups to how it found them", () => {
    const groups = accessProfileGroups("engineering");
    const plan = buildPlan(update({ displayName: "Rizky M." }), {
      groups,
      enabled: false,
      ou: quarantineOu(),
    });

    expect(plan.steps.map((step) => step.key)).toEqual(["set-attributes", "verify"]);
    expect(plan.postconditions).toMatchObject({
      enabled: false,
      ou: quarantineOu(),
      requiredGroups: groups,
      forbiddenGroups: [],
      attributes: { displayName: "Rizky M." },
    });
  });

  it("changes the directory and the record only after both approvals and a verified read-back", async () => {
    // The real LDAP driver over a fake directory, holding Rizky and his manager.
    const dir = installTestDirectory();
    dir.addManager("sarah.wijaya", "Sarah Wijaya");

    const account: TestAccount = {
      objectGUID: RIZKY_GUID,
      sAMAccountName: "rizky.maulana",
      displayName: "Rizky Maulana",
      mail: "rizky.maulana@example.com",
      department: "IT — Engineering",
      title: "Senior Backend Engineer",
      manager: "sarah.wijaya",
      enabled: true,
      ou: accessProfileOu("engineering"),
      groups: accessProfileGroups("engineering"),
    };
    dir.addAccount(account);

    const request = await raise(
      update({ department: "IT — Platform", jobTitle: "Platform Engineer", locationType: "CABANG", branchName: "Surabaya" }),
    );

    // Nothing runs on one approval.
    await decide(request.id, { version: 1, stage: "MANAGER", decision: "APPROVED" }, MANAGER);
    expect((await runDueJobs({ workerId: "w1" })).ran).toBe(0);

    await decide(request.id, { version: 1, stage: "CISO", decision: "APPROVED" }, CISO);
    const report = await runDueJobs({ workerId: "w1" });
    expect(report.completed).toBe(1);

    const [after] = await dir.accounts();
    expect(after).toMatchObject({
      department: "IT — Platform",
      title: "Platform Engineer",
      enabled: true,
      ou: accessProfileOu("engineering"),
      groups: accessProfileGroups("engineering"),
    });

    const saved = await store();
    expect(saved.lifecycleRequests[0].status).toBe("COMPLETED");
    expect(saved.employees.find((employee) => employee.id === RIZKY)).toMatchObject({
      department: "IT — Platform",
      jobTitle: "Platform Engineer",
      locationType: "CABANG",
      branchName: "Surabaya",
      objectGUID: RIZKY_GUID,
      // Unchanged: a profile update cannot move the manager.
      managerEmail: "sarah.wijaya@example.com",
    });
    expect(saved.activity.some((entry) => entry.action === "employee.profile_updated")).toBe(true);
  });
});
