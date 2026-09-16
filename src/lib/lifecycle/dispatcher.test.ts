import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEmailDriver } from "@/lib/email";
import type { StoreShape } from "@/lib/db/store";

import { dispatchDueEmails } from "./dispatcher";
import { seal } from "./outboxCrypto";
import { MAX_SEND_ATTEMPTS, type OutboxEvent } from "./outboxTypes";

/**
 * The dispatcher's failure paths.
 *
 * Sending when everything works is the easy half. What matters is that a
 * provider outage retries with backoff rather than hammering, that an address
 * nobody can deliver to stops instead of looping, and that the approval token
 * sitting in the queue is deleted the moment it is no longer needed.
 */

let workspace: string;
let storePath: string;

const PAST = "2026-09-16T09:00:00.000Z";
const NOW = new Date("2026-09-16T10:00:00.000Z");

function event(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  return {
    eventId: "out_1",
    kind: "approval.request",
    aggregateId: "lr_1",
    version: 1,
    stage: "MANAGER",
    recipient: "sarah.wijaya@example.com",
    sealedPayload: seal(
      JSON.stringify({
        kind: "approval.request",
        token: "raw-token-value",
        requestId: "lr_1",
        version: 1,
        type: "TERMINATION",
        stage: "MANAGER",
        subjectName: "Rizky Maulana",
        requesterName: "Ayu Prameswari",
        approverName: "Sarah Wijaya",
      }),
    ),
    state: "PENDING",
    attempt: 0,
    nextAttemptAt: PAST,
    createdAt: PAST,
    updatedAt: PAST,
    ...overrides,
  };
}

async function seed(events: OutboxEvent[]): Promise<void> {
  const store: StoreShape = {
    employees: [],
    requests: [],
    activity: [],
    lifecycleRequests: [],
    executionJobs: [],
    outboxEvents: events,
    emailDeliveries: [],
    approvalTokens: [],
    auditEvents: [],
  };
  await writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

async function store(): Promise<StoreShape> {
  return JSON.parse(await readFile(storePath, "utf8")) as StoreShape;
}

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "hc-dispatch-"));
  storePath = path.join(workspace, "store.json");
  vi.stubEnv("HC_DATA_FILE", storePath);
  vi.stubEnv("EMAIL_DRIVER", "file");
  vi.stubEnv("EMAIL_FILE_DIR", path.join(workspace, "mail"));
  vi.stubEnv("EMAIL_FAULT", "none");
  vi.stubEnv("NODE_ENV", "development");
  resetEmailDriver();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  resetEmailDriver();
  await rm(workspace, { recursive: true, force: true });
});

describe("a message that goes out", () => {
  it("is recorded as accepted, never as delivered", async () => {
    await seed([event()]);

    const report = await dispatchDueEmails({ now: NOW });
    expect(report.accepted).toBe(1);

    const after = await store();
    expect(after.outboxEvents[0].state).toBe("SENT");

    const [delivery] = after.emailDeliveries;
    expect(delivery.acceptedAt).toBeTruthy();
    expect(delivery.providerRef).toMatch(/^file:/);
    // There is deliberately no such field: nothing here ever learns it.
    expect("deliveredAt" in delivery).toBe(false);
  });

  it("deletes the sealed payload once the message is handed over", async () => {
    await seed([event()]);
    await dispatchDueEmails({ now: NOW });

    const [stored] = (await store()).outboxEvents;
    // The payload held a usable approval token and has no purpose left.
    expect(stored.sealedPayload).toBeUndefined();
    expect(JSON.stringify(stored)).not.toContain("raw-token-value");
  });
});

describe("a provider that is struggling", () => {
  it("backs off rather than retrying immediately", async () => {
    vi.stubEnv("EMAIL_FAULT", "transient:1");
    resetEmailDriver();
    await seed([event()]);

    const report = await dispatchDueEmails({ now: NOW });
    expect(report.retried).toBe(1);

    const [stored] = (await store()).outboxEvents;
    expect(stored.state).toBe("PENDING");
    expect(Date.parse(stored.nextAttemptAt)).toBeGreaterThan(NOW.getTime());
    // The attempt is counted, and the payload survives for the retry.
    expect(stored.attempt).toBe(1);
    expect(stored.sealedPayload).toBeDefined();
  });

  it("obeys a Retry-After rather than guessing", async () => {
    vi.stubEnv("EMAIL_FAULT", "rate-limited:600");
    resetEmailDriver();
    await seed([event()]);

    await dispatchDueEmails({ now: NOW });

    const [stored] = (await store()).outboxEvents;
    expect(Date.parse(stored.nextAttemptAt) - NOW.getTime()).toBe(600_000);
  });

  it("gives up once the attempts are exhausted", async () => {
    vi.stubEnv("EMAIL_FAULT", "transient:1");
    resetEmailDriver();
    // Already on the last rung.
    await seed([event({ attempt: MAX_SEND_ATTEMPTS - 1 })]);

    const report = await dispatchDueEmails({ now: NOW });

    expect(report.dead).toBe(1);
    const [stored] = (await store()).outboxEvents;
    expect(stored.state).toBe("DEAD");
    // An event retried forever is an event nobody ever reads.
    expect(stored.sealedPayload).toBeUndefined();
  });
});

describe("a failure nobody can retry around", () => {
  it("dead-letters a rejected recipient on the first attempt", async () => {
    vi.stubEnv("EMAIL_FAULT", "recipient-rejected");
    resetEmailDriver();
    await seed([event()]);

    const report = await dispatchDueEmails({ now: NOW });

    expect(report.dead).toBe(1);
    expect((await store()).outboxEvents[0].lastErrorKind).toBe("RECIPIENT_REJECTED");
  });

  it("dead-letters a payload it cannot decrypt, rather than looping", async () => {
    await seed([event({ sealedPayload: { iv: "AAAA", tag: "BBBB", ciphertext: "CCCC" } })]);

    const report = await dispatchDueEmails({ now: NOW });

    expect(report.dead).toBe(1);
    expect((await store()).outboxEvents[0].lastError).toMatch(/OUTBOX_ENCRYPTION_KEY/);
  });
});

describe("what is due", () => {
  it("leaves an event alone until its next attempt time arrives", async () => {
    await seed([event({ nextAttemptAt: "2099-01-01T00:00:00.000Z" })]);

    const report = await dispatchDueEmails({ now: NOW });

    expect(report.attempted).toBe(0);
    expect((await store()).outboxEvents[0].attempt).toBe(0);
  });

  it("ignores events that are already sent or dead", async () => {
    await seed([event({ state: "SENT" }), event({ eventId: "out_2", state: "DEAD" })]);

    expect((await dispatchDueEmails({ now: NOW })).attempted).toBe(0);
  });
});
