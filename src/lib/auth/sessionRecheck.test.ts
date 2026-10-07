import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeLdapDirectory } from "@/lib/ad/fakeLdapDirectory";

import { recentSecurityEvents } from "./securityLog";
import { createSession, resolveSession } from "./session";
import { recheckSessions, resolveRecheckMinutes } from "./sessionRecheck";

/**
 * Sessions matched against the directory: whoever AD no longer lets in is
 * signed out of the portal too.
 */

const BASE = "DC=corp,DC=example,DC=com";
const PEOPLE = `OU=People,${BASE}`;
const HC_GROUP = `CN=HC Officers,OU=Groups,${BASE}`;
const AUDIT_GROUP = `CN=Internal Audit,OU=Groups,${BASE}`;

let workspace: string;
let directory: FakeLdapDirectory;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "hc-recheck-"));
  vi.stubEnv("HC_SESSION_FILE", path.join(workspace, "sessions.json"));
  vi.stubEnv("HC_SECURITY_LOG_FILE", path.join(workspace, "security.jsonl"));
  vi.stubEnv("AD_GROUP_HC", HC_GROUP);
  vi.stubEnv("AD_GROUP_AUDITOR", AUDIT_GROUP);
  vi.stubEnv("AD_GROUP_ADMIN", "");
  vi.stubEnv("AD_GROUP_OPS", "");
  vi.stubEnv("LDAP_ADMIN_GROUP", "");

  directory = new FakeLdapDirectory();
  directory.addOu(PEOPLE);
  directory.addOu(`OU=Groups,${BASE}`);
  directory.addGroup(HC_GROUP);
  directory.addGroup(AUDIT_GROUP);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(workspace, { recursive: true, force: true });
});

function person(name: string, options: { enabled?: boolean; groups?: string[] } = {}) {
  const dn = `CN=${name},${PEOPLE}`;
  directory.addUser({ dn, sAMAccountName: name, userAccountControl: options.enabled === false ? 0x202 : 0x200 });
  for (const group of options.groups ?? [HC_GROUP]) directory.addMember(group, dn);
}

async function signIn(name: string) {
  const { id } = await createSession({
    userId: name,
    username: name,
    email: `${name}@corp.example.com`,
    fullName: name,
    roles: ["HC_REQUESTER"],
  });
  return id;
}

const run = () => recheckSessions({ connect: async () => directory.client(), baseDn: BASE });

describe("matching sessions against AD", () => {
  it("leaves alone everybody AD still lets in", async () => {
    person("ayu");
    const session = await signIn("ayu");

    const report = await run();

    expect(report).toEqual({ checked: 1, revoked: [] });
    expect(await resolveSession(session)).toBeDefined();
  });

  it("signs out a person disabled in AD, one removed from it, and one taken out of the HC group", async () => {
    person("ayu");
    person("budi", { enabled: false });
    person("citra", { groups: [AUDIT_GROUP] });
    const sessions = {
      ayu: await signIn("ayu"),
      budi: await signIn("budi"),
      citra: await signIn("citra"),
      dodi: await signIn("dodi"), // never in this directory, or deleted since
    };

    const report = await run();

    expect(report.revoked).toEqual([
      { username: "budi", reason: "akun dinonaktifkan di AD" },
      { username: "citra", reason: "keanggotaan group portal berubah" },
      { username: "dodi", reason: "akun tidak ada lagi di AD" },
    ]);
    expect(await resolveSession(sessions.ayu)).toBeDefined();
    expect(await resolveSession(sessions.budi)).toBeUndefined();
    expect(await resolveSession(sessions.citra)).toBeUndefined();
    expect(await resolveSession(sessions.dodi)).toBeUndefined();

    const logged = await recentSecurityEvents();
    expect(logged.filter((event) => event.type === "session.revoked")).toHaveLength(3);
  });

  it("revokes nothing when AD cannot be read, and says why", async () => {
    person("budi", { enabled: false });
    const session = await signIn("budi");

    const report = await recheckSessions({
      connect: async () => {
        throw new Error("connect ECONNREFUSED 10.0.0.10:636");
      },
      baseDn: BASE,
    });

    expect(report.error).toMatch(/ECONNREFUSED/);
    expect(report.revoked).toEqual([]);
    expect(await resolveSession(session)).toBeDefined();
  });

  it("does not open a connection when nobody is signed in", async () => {
    const connect = vi.fn(async () => directory.client());
    expect(await recheckSessions({ connect, baseDn: BASE })).toEqual({ checked: 0, revoked: [] });
    expect(connect).not.toHaveBeenCalled();
  });
});

describe("how often", () => {
  it("defaults to five minutes, and can be switched off", () => {
    expect(resolveRecheckMinutes(undefined)).toBe(5);
    expect(resolveRecheckMinutes("10")).toBe(10);
    expect(resolveRecheckMinutes("0")).toBeUndefined();
    expect(resolveRecheckMinutes("off")).toBeUndefined();
    expect(() => resolveRecheckMinutes("lima")).toThrow(/SESSION_RECHECK_MINUTES/);
  });
});
