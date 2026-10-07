import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runPortalChecks } from "./portalChecks";

/**
 * Email and sign-in on the status page: what each setting is reported as.
 */

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "hc-portal-checks-"));
  vi.stubEnv("HC_MFA_FILE", path.join(workspace, "mfa.json"));
  for (const name of [
    "EMAIL_DRIVER",
    "EMAIL_REDIRECT_TO",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_SENDER",
    "SMTP_TLS",
    "LOGIN_2FA",
    "DEMO_LOGIN",
    "LDAP_URL",
    "AD_LDAP_URL",
    "SESSION_RECHECK_MINUTES",
    "OUTBOX_POLL_SECONDS",
    "APP_BASE_URL",
  ]) {
    vi.stubEnv(name, "");
  }
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(workspace, { recursive: true, force: true });
});

function byId(checks: Awaited<ReturnType<typeof runPortalChecks>>, id: string) {
  return checks.find((check) => check.id === id)!;
}

describe("email", () => {
  function relay() {
    vi.stubEnv("EMAIL_DRIVER", "smtp");
    vi.stubEnv("SMTP_HOST", "relay.corp.example");
    vi.stubEnv("SMTP_PORT", "25");
    vi.stubEnv("SMTP_SENDER", "hc-portal@corp.example");
  }

  it("connects and logs in before calling SMTP fine", async () => {
    relay();
    const verifySmtp = vi.fn(async () => undefined);

    const check = byId(await runPortalChecks({ verifySmtp }), "email");

    expect(verifySmtp).toHaveBeenCalledOnce();
    expect(check.status).toBe("ok");
    expect(check.message).toMatch(/relay\.corp\.example:25 terhubung, tanpa login \(relay\)/);
  });

  it("reports what the server said when it refuses", async () => {
    relay();
    const check = byId(
      await runPortalChecks({
        verifySmtp: async () => {
          throw new Error("SMTP menolak autentikasi: 535 5.7.3 Authentication unsuccessful");
        },
      }),
      "email",
    );

    expect(check.status).toBe("fail");
    expect(check.message).toMatch(/535/);
  });

  it("warns loudly while every email is redirected to one inbox", async () => {
    relay();
    vi.stubEnv("EMAIL_REDIRECT_TO", "akmal@example.com");
    const check = byId(await runPortalChecks({ verifySmtp: async () => undefined }), "email");
    expect(check.status).toBe("warn");
    expect(check.message).toMatch(/DIALIHKAN ke akmal@example\.com/);
  });

  it("fails a production portal that only writes email to files", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_DRIVER", "file");
    expect(byId(await runPortalChecks(), "email").status).toBe("fail");
  });
});

describe("sign-in", () => {
  it("reports two-step verification on by default, and off when switched off", async () => {
    expect(byId(await runPortalChecks(), "login-2fa").status).toBe("ok");
    vi.stubEnv("LOGIN_2FA", "off");
    expect(byId(await runPortalChecks(), "login-2fa").status).toBe("warn");
  });

  it("flags the demo accounts when they are switched on", async () => {
    expect(byId(await runPortalChecks(), "demo-login").status).toBe("ok");
    vi.stubEnv("DEMO_LOGIN", "on");
    expect(byId(await runPortalChecks(), "demo-login").status).toBe("warn");
  });

  it("fails production without an https address", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "http://hc-portal.corp.example");
    expect(byId(await runPortalChecks(), "https").status).toBe("fail");
    vi.stubEnv("APP_BASE_URL", "https://hc-portal.corp.example");
    expect(byId(await runPortalChecks(), "https").status).toBe("ok");
  });
});
