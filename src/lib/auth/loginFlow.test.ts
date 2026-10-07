import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Signing in, end to end through both routes, with two-step verification.
 *
 * The cookie jar stands in for next/headers: the routes set and read real
 * cookies, and these tests look at what was set — above all, that no session
 * cookie exists until the code is right.
 */

const jar = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    store: {
      get: (name: string) => (values.has(name) ? { name, value: values.get(name)! } : undefined),
      set: (name: string, value: string) => {
        if (value) values.set(name, value);
        else values.delete(name);
      },
    },
  };
});

vi.mock("next/headers", () => ({ cookies: async () => jar.store }));

import { POST as login } from "@/app/api/auth/login/route";
import { POST as mfa } from "@/app/api/auth/mfa/route";
import { resetRateLimit } from "@/lib/http/rateLimit";

import { resetLoginThrottle } from "./loginThrottle";
import { listEnrollments } from "./mfa";
import { PENDING_COOKIE, resetPendingLogins } from "./pendingLogin";
import { recentSecurityEvents } from "./securityLog";
import { SESSION_COOKIE, cookiesAreSecure, resolveSession } from "./session";
import { stepAt, totpCode } from "./totp";

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "hc-login-"));
  vi.stubEnv("HC_SESSION_FILE", path.join(workspace, "sessions.json"));
  vi.stubEnv("HC_DATA_FILE", path.join(workspace, "store.json"));
  vi.stubEnv("HC_MFA_FILE", path.join(workspace, "mfa.json"));
  vi.stubEnv("HC_SECURITY_LOG_FILE", path.join(workspace, "security.jsonl"));
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("LDAP_URL", "");
  vi.stubEnv("AD_LDAP_URL", "");
  vi.stubEnv("DEMO_LOGIN", "on");
  vi.stubEnv("LOGIN_2FA", "");
  jar.values.clear();
  resetPendingLogins();
  resetLoginThrottle();
  resetRateLimit("login:unknown");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T03:00:00Z"));
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await rm(workspace, { recursive: true, force: true });
});

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000", ...headers },
    body: JSON.stringify(body),
  });
}

async function password(pass = "admin12345", headers: Record<string, string> = {}) {
  const response = await login(post("/api/auth/login", { username: "admin", password: pass }, headers));
  return { status: response.status, body: await response.json() };
}

async function code(value: string) {
  const response = await mfa(post("/api/auth/mfa", { code: value }));
  return { status: response.status, body: await response.json() };
}

function now(secret: string, offsetSteps = 0) {
  return totpCode(secret, stepAt(Date.now()) + offsetSteps);
}

/** First sign-in through to a session; returns the enrolled secret. */
async function enroll(): Promise<string> {
  const first = await password();
  const secret = first.body.data.mfa.secret as string;
  expect((await code(now(secret))).status).toBe(200);
  jar.values.clear();
  return secret;
}

describe("a first sign-in", () => {
  it("asks for the phone to be connected, and opens no session on the password alone", async () => {
    const { status, body } = await password();

    expect(status).toBe(200);
    expect(body.data.mfa.mode).toBe("enroll");
    expect(body.data.mfa.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(body.data.mfa.qr).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(jar.values.has(SESSION_COOKIE)).toBe(false);
    expect(jar.values.has(PENDING_COOKIE)).toBe(true);
  });

  it("stores the phone only once a code from it is right", async () => {
    const { body } = await password();
    const secret = body.data.mfa.secret as string;

    const wrong = await code("000000");
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe("MFA_INVALID");
    expect(await listEnrollments()).toEqual([]);

    const right = await code(now(secret));
    expect(right.status).toBe(200);
    expect(jar.values.has(SESSION_COOKIE)).toBe(true);
    expect(await resolveSession(jar.values.get(SESSION_COOKIE))).toMatchObject({ username: "admin" });
    expect((await listEnrollments()).map((entry) => entry.userId)).toEqual(["admin"]);
  });

  it("keeps the secret sealed on disk", async () => {
    const secret = await enroll();
    const onDisk = await readFile(path.join(workspace, "mfa.json"), "utf8");
    expect(onDisk).not.toContain(secret);
  });
});

describe("a sign-in with a phone already connected", () => {
  it("asks for a code and shows no QR or secret", async () => {
    await enroll();
    const { body } = await password();
    expect(body.data.mfa).toEqual({ mode: "verify" });
  });

  it("refuses a code a second time, even inside its thirty seconds", async () => {
    const secret = await enroll();
    vi.setSystemTime(Date.now() + 30_000);

    await password();
    const used = now(secret);
    expect((await code(used)).status).toBe(200);

    jar.values.clear();
    await password();
    const again = await code(used);
    expect(again.status).toBe(401);
    expect(again.body.error).toMatch(/sudah dipakai/);
  });

  it("sends the person back to the password after five wrong codes", async () => {
    await enroll();
    await password();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await code("111111")).body.code).toBe("MFA_INVALID");
    }
    // The fifth wrong code is also the fifth failure on the account: locked.
    const last = await code("111111");
    expect(last.status).toBe(429);
    expect(last.body.code).toBe("ACCOUNT_LOCKED");
    expect((await code("111111")).body.code).toBe("MFA_EXPIRED");
  });

  it("forgets a code step left open for more than five minutes", async () => {
    const secret = await enroll();
    await password();
    vi.setSystemTime(Date.now() + 6 * 60_000);
    const late = await code(now(secret));
    expect(late.status).toBe(401);
    expect(late.body.code).toBe("MFA_EXPIRED");
  });
});

describe("guessing passwords", () => {
  it("locks the account after five failures, before AD is asked again", async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await password("salah")).status).toBe(401);
    }
    expect((await password("salah")).body.code).toBe("ACCOUNT_LOCKED");

    const correct = await password();
    expect(correct.status).toBe(429);
    expect(correct.body.code).toBe("ACCOUNT_LOCKED");
  });

  it("is not reset by a made-up X-Forwarded-For on every attempt", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await password("salah", { "X-Forwarded-For": `203.0.113.${attempt}` });
    }
    expect((await password("admin12345", { "X-Forwarded-For": "198.51.100.7" })).body.code).toBe("ACCOUNT_LOCKED");
  });

  it("lifts the lock after fifteen minutes", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) await password("salah");
    vi.setSystemTime(Date.now() + 16 * 60_000);
    resetRateLimit("login:unknown");
    expect((await password()).status).toBe(200);
  });

  it("writes every attempt to the security log, without the password", async () => {
    await password("rahasia-yang-salah");
    await password();

    const events = await recentSecurityEvents();
    expect(events.map((event) => event.type)).toEqual(["login.failed"]);
    const raw = await readFile(path.join(workspace, "security.jsonl"), "utf8");
    expect(raw).not.toContain("rahasia-yang-salah");
    expect(raw).not.toContain("admin12345");
  });
});

describe("the secure flag on cookies", () => {
  it("is on in production unless the portal is published at an http:// address", () => {
    expect(cookiesAreSecure({ NODE_ENV: "production", APP_BASE_URL: "https://hc.corp.example" })).toBe(true);
    expect(cookiesAreSecure({ NODE_ENV: "production" })).toBe(true);
    expect(cookiesAreSecure({ NODE_ENV: "production", APP_BASE_URL: "http://localhost:3000" })).toBe(false);
    expect(cookiesAreSecure({ NODE_ENV: "development", APP_BASE_URL: "https://hc.corp.example" })).toBe(false);
  });
});

describe("LOGIN_2FA=off", () => {
  it("opens the session on the password, as before", async () => {
    vi.stubEnv("LOGIN_2FA", "off");
    const { status, body } = await password();

    expect(status).toBe(200);
    expect(body.data.user.username).toBe("admin");
    expect(body.data.mfa).toBeUndefined();
    expect(jar.values.has(SESSION_COOKIE)).toBe(true);
  });

  it("keeps a connected phone for when it is switched back on", async () => {
    await enroll();
    vi.stubEnv("LOGIN_2FA", "off");
    await password();
    jar.values.clear();

    vi.stubEnv("LOGIN_2FA", "on");
    expect((await password()).body.data.mfa).toEqual({ mode: "verify" });
  });
});
