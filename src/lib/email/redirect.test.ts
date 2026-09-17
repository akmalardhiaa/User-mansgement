import { afterEach, describe, expect, it, vi } from "vitest";

import { EmailConfigurationError, getEmailDriver, resetEmailDriver } from ".";
import { RedirectingEmailDriver } from "./redirect";
import type { EmailAcceptance, EmailDriver, EmailMessage } from "./types";

/**
 * Where a redirected message actually goes, and what it still says.
 *
 * The control being tested is not a convenience. Every approval email carries a
 * single-use token and the page that consumes it needs no session, so a message
 * reaching the wrong inbox hands that person a decision that was not theirs.
 */

class CapturingDriver implements EmailDriver {
  readonly name = "capture";
  readonly simulated = true;
  sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<EmailAcceptance> {
    this.sent.push(message);
    return { accepted: true, providerRef: "capture:1", acceptedAt: "2026-09-16T00:00:00.000Z" };
  }
}

function message(): EmailMessage {
  return {
    to: { name: "Dimas Anggara", address: "dimas.anggara@example.com" },
    subject: "[Persetujuan] Termination — Clara Halim",
    html: "<p>Mohon persetujuan.</p>",
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetEmailDriver();
});

describe("redirecting a message", () => {
  it("sends to the configured mailbox, not the addressee", async () => {
    const inner = new CapturingDriver();
    await new RedirectingEmailDriver(inner, "me@gmail.com").send(message());

    expect(inner.sent[0].to.address).toBe("me@gmail.com");
  });

  it("keeps the intended recipient visible in the subject and the body", async () => {
    const inner = new CapturingDriver();
    await new RedirectingEmailDriver(inner, "me@gmail.com").send(message());

    // One inbox holding every approver's mail is useless if you cannot tell
    // which approver each message was asking.
    expect(inner.sent[0].subject).toContain("dimas.anggara@example.com");
    expect(inner.sent[0].html).toContain("dimas.anggara@example.com");
  });

  it("leaves the original body intact below the notice", async () => {
    const inner = new CapturingDriver();
    await new RedirectingEmailDriver(inner, "me@gmail.com").send(message());

    expect(inner.sent[0].html).toContain("<p>Mohon persetujuan.</p>");
  });

  it("does not claim to be simulated when the wrapped driver is not", async () => {
    const real: EmailDriver = {
      name: "graph",
      simulated: false,
      send: async () => ({ accepted: true, providerRef: "x", acceptedAt: "2026-09-16T00:00:00.000Z" }),
    };

    // Redirected Graph mail really leaves the tenant. Calling it simulated
    // would understate what happened.
    const wrapped = new RedirectingEmailDriver(real, "me@gmail.com");
    expect(wrapped.simulated).toBe(false);
    expect(wrapped.name).toBe("graph+redirect");
  });
});

describe("when the redirect is wired in", () => {
  it("is absent unless asked for", () => {
    vi.stubEnv("EMAIL_DRIVER", "file");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("EMAIL_REDIRECT_TO", "");
    resetEmailDriver();

    expect(getEmailDriver().name).toBe("file");
  });

  it("wraps whichever driver was chosen", () => {
    vi.stubEnv("EMAIL_DRIVER", "file");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("EMAIL_REDIRECT_TO", "me@gmail.com");
    resetEmailDriver();

    expect(getEmailDriver().name).toBe("file+redirect");
  });

  it("refuses a malformed address rather than ignoring it", () => {
    // Ignoring it would send to the real addresses — the exact outcome somebody
    // set this variable to prevent.
    vi.stubEnv("EMAIL_DRIVER", "file");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("EMAIL_REDIRECT_TO", "bukan-alamat");
    resetEmailDriver();

    expect(() => getEmailDriver()).toThrow(EmailConfigurationError);
  });

  it("refuses to redirect in production", () => {
    /*
     * Approvers silently never told, while the dashboard reports the message as
     * accepted, is what this layer exists to prevent.
     *
     * The Graph configuration has to be complete for this to be reachable at
     * all. The driver is built before the redirect wraps it, and production
     * refuses `file` outright — so a fully configured tenant is the only way a
     * production deployment gets far enough to still have a redirect switched
     * on. That is exactly the case worth catching, and an earlier version of
     * this test asserted the refusal down a path that died on missing
     * credentials long before reaching it.
     */
    vi.stubEnv("EMAIL_DRIVER", "graph");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GRAPH_TENANT_ID", "tenant-id");
    vi.stubEnv("GRAPH_CLIENT_ID", "client-id");
    vi.stubEnv("GRAPH_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GRAPH_SENDER_MAILBOX", "hc-noreply@example.com");
    vi.stubEnv("EMAIL_REDIRECT_TO", "me@gmail.com");
    resetEmailDriver();

    expect(() => getEmailDriver()).toThrow(/production/);
  });
});
