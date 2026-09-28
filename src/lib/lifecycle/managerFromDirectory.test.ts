import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PortalSession } from "@/lib/auth/session";

import {
  LifecycleError,
  createDraft,
  submitRequest,
} from "./service";
import type { OnboardingPayload } from "./types";

/**
 * Who may be named as the approving manager: somebody the directory knows and
 * who is still active — not an address the requester typed.
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

const ONBOARDING: OnboardingPayload = {
  kind: "ONBOARDING",
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

async function raise(payload: OnboardingPayload, session = AYU) {
  const draft = await createDraft({ payload }, session);
  return submitRequest(draft.id, draft.version, session);
}

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "hc-manager-"));
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
