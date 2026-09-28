import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAdDriver } from "@/lib/ad";
import type { AdAccountState } from "@/lib/ad/types";
import type { PortalSession } from "@/lib/auth/session";
import type { StoreShape } from "@/lib/db/store";

import { resolveCisoTeamForSubmit } from "./cisoTeam";
import { RoutingError } from "./routing";
import { createDraft, submitRequest } from "./service";

/**
 * The CISO team, read from a directory group at submit.
 *
 * Joining or leaving the team is then a change made in Active Directory, and
 * the head of the function — often in the same group — is left out by name.
 */

let workspace: string;
let storePath: string;

const GROUP = "CN=IT Security Approvers,OU=Groups,DC=corp,DC=example,DC=com";

const HC: PortalSession = {
  userId: "ayu",
  username: "ayu",
  email: "ayu.prameswari@example.com",
  fullName: "Ayu Prameswari",
  roles: ["HC_REQUESTER"],
  createdAt: "2026-09-16T00:00:00.000Z",
  absoluteExpiresAt: "2026-09-17T00:00:00.000Z",
};

function account(name: string, overrides: Partial<AdAccountState> = {}): AdAccountState {
  const handle = name.toLowerCase();
  return {
    objectGUID: `guid-${handle}`,
    sAMAccountName: handle,
    userPrincipalName: `${handle}@example.com`,
    displayName: name,
    mail: `${handle}@example.com`,
    department: "IT — Security",
    title: "Security Analyst",
    enabled: true,
    ou: "OU=Security,DC=corp,DC=example,DC=com",
    groups: [GROUP],
    ...overrides,
  };
}

async function directory(accounts: AdAccountState[]): Promise<void> {
  await writeFile(path.join(workspace, "mock-ad.json"), JSON.stringify({ accounts }), "utf8");
}

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "hc-ciso-group-"));
  storePath = path.join(workspace, "store.json");
  vi.stubEnv("HC_DATA_FILE", storePath);
  vi.stubEnv("AD_DRIVER", "mock");
  vi.stubEnv("AD_MOCK_FILE", path.join(workspace, "mock-ad.json"));
  vi.stubEnv("AD_MOCK_FAULT", "none");
  vi.stubEnv("CISO_APPROVER_GROUP", GROUP);
  vi.stubEnv("CISO_EXCLUDE_EMAILS", "kepala@example.com");
  vi.stubEnv("NODE_ENV", "test");
  resetAdDriver();

  await directory([
    account("Rina"),
    account("Budi"),
    account("Kepala"), // the head of the function: in the group, never asked
    account("Dewi", { enabled: false }), // left the company
    account("Eko", { groups: ["CN=Former IT Security Approvers,OU=Archive,DC=corp,DC=example,DC=com"] }),
    account("Fajar", { groups: [] }),
  ]);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  resetAdDriver();
  await rm(workspace, { recursive: true, force: true });
});

describe("reading the team from the directory", () => {
  it("takes enabled members of exactly that group, minus the head", async () => {
    const team = await resolveCisoTeamForSubmit();
    expect(team.map((member) => member.name)).toEqual(["Rina", "Budi"]);
  });

  it("is what a submitted request is routed to", async () => {
    const draft = await createDraft(
      {
        payload: {
          kind: "TERMINATION",
          employeeId: "emp_seed_002",
          reasonCategory: "RESIGN",
          lastWorkingDate: "2026-10-31",
        },
      },
      HC,
    );
    const request = await submitRequest(draft.id, draft.version, HC);

    expect(request.approvals[1].pool?.map((member) => member.email)).toEqual([
      "rina@example.com",
      "budi@example.com",
    ]);
  });

  it("refuses to submit — and writes nothing — when the directory cannot be read", async () => {
    const draft = await createDraft(
      {
        payload: {
          kind: "TERMINATION",
          employeeId: "emp_seed_002",
          reasonCategory: "RESIGN",
          lastWorkingDate: "2026-10-31",
        },
      },
      HC,
    );
    vi.stubEnv("AD_MOCK_FAULT", "permission");
    resetAdDriver();

    await expect(submitRequest(draft.id, draft.version, HC)).rejects.toThrow(RoutingError);

    const saved = JSON.parse(await readFile(storePath, "utf8")) as StoreShape;
    expect(saved.lifecycleRequests[0].status).toBe("DRAFT");
    expect(saved.outboxEvents).toHaveLength(0);
  });

  it("refuses when nobody in the group can be asked", async () => {
    vi.stubEnv("CISO_EXCLUDE_EMAILS", "kepala@example.com, rina@example.com, budi@example.com");
    await expect(resolveCisoTeamForSubmit()).rejects.toThrow(RoutingError);
  });
});
