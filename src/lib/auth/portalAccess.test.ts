import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as login } from "@/app/api/auth/login/route";
import { resetRateLimit } from "@/lib/http/rateLimit";

import { PERMISSIONS, portalRolesOf, type PortalRole } from "./roles";
import { createSession, resolveSession } from "./session";

/**
 * The portal is HC's alone.
 *
 * Managers and the CISO team approve from their email. These pin down that no
 * route into the portal is left for them: no role, no permission to approve, no
 * login, and no session that survives from before the rule.
 */

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "hc-access-"));
  vi.stubEnv("HC_SESSION_FILE", path.join(workspace, "sessions.json"));
  vi.stubEnv("HC_DATA_FILE", path.join(workspace, "store.json"));
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("LDAP_URL", "");
  vi.stubEnv("MOCK_AD_LOGIN", "");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(workspace, { recursive: true, force: true });
});

describe("roles", () => {
  it("no longer include an approver of any kind", () => {
    expect(portalRolesOf(["MANAGER", "CISO_APPROVER", "HC_REQUESTER"])).toEqual(["HC_REQUESTER"]);
  });

  it("carry no permission that could approve from the portal", () => {
    expect(PERMISSIONS.some((permission) => permission.startsWith("approval."))).toBe(false);
  });
});

describe("signing in", () => {
  function attempt(username: string, password: string) {
    return login(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
        body: JSON.stringify({ username, password }),
      }),
    );
  }

  it("refuses a manager with a correct password, and says to use the email", async () => {
    resetRateLimit("login:unknown");
    const response = await attempt("dimas", "dimas12345");

    expect(response.status).toBe(403);
    const body = (await response.json()) as { code?: string; error?: string };
    expect(body.code).toBe("NOT_A_PORTAL_USER");
    expect(body.error).toContain("dari email");
    // Refused before a session exists: nothing to carry into the portal.
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("refuses the CISO approver too", async () => {
    const response = await attempt("bagus", "bagus12345");
    expect(response.status).toBe(403);
  });
});

describe("a session opened before the rule", () => {
  it("stops working immediately when all it carries is a retired role", async () => {
    const { id } = await createSession({
      userId: "sarah",
      username: "sarah",
      email: "sarah.wijaya@example.com",
      fullName: "Sarah Wijaya",
      roles: ["MANAGER"] as unknown as PortalRole[],
    });

    expect(await resolveSession(id)).toBeUndefined();
  });

  it("keeps working for HC", async () => {
    const { id } = await createSession({
      userId: "ayu",
      username: "ayu",
      email: "ayu.prameswari@example.com",
      fullName: "Ayu Prameswari",
      roles: ["HC_REQUESTER"],
    });

    expect((await resolveSession(id))?.roles).toEqual(["HC_REQUESTER"]);
  });
});
