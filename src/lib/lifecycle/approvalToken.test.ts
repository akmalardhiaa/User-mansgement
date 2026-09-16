import { describe, expect, it } from "vitest";

import {
  checkToken,
  hashEquals,
  hashToken,
  issueToken,
  revokeTokens,
  type ApprovalTokenRecord,
} from "./approvalToken";

/**
 * What a link in an approval email may and may not do.
 *
 * Each of these guards a specific way an emailed credential goes wrong: a
 * forwarded link deciding somebody else's stage, a link for text that has since
 * been revised, a double-click deciding twice, a leaked store of tokens.
 */

const NOW = new Date("2026-09-16T10:00:00.000Z");

function record(overrides: Partial<ApprovalTokenRecord> = {}): ApprovalTokenRecord {
  const issued = issueToken("lr_1", 1, "MANAGER", NOW);
  return { ...issued.record, ...overrides };
}

describe("issuing", () => {
  it("produces a long random value and stores only its hash", () => {
    const { raw, record: stored } = issueToken("lr_1", 1, "MANAGER", NOW);

    // 32 bytes as base64url.
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(stored.tokenHash).toBe(hashToken(raw));
    // The raw value must not be recoverable from what is kept.
    expect(JSON.stringify(stored)).not.toContain(raw);
  });

  it("never issues the same token twice", () => {
    const a = issueToken("lr_1", 1, "MANAGER", NOW);
    const b = issueToken("lr_1", 1, "MANAGER", NOW);

    expect(a.raw).not.toBe(b.raw);
  });
});

describe("checking", () => {
  const expected = { requestId: "lr_1", version: 1, stage: "MANAGER" as const };

  it("accepts the token it was issued for", () => {
    const issued = issueToken("lr_1", 1, "MANAGER", NOW);

    expect(checkToken([issued.record], issued.raw, expected, NOW).ok).toBe(true);
  });

  it("rejects a value nobody issued", () => {
    const issued = issueToken("lr_1", 1, "MANAGER", NOW);
    const check = checkToken([issued.record], "not-a-real-token", expected, NOW);

    expect(check).toEqual({ ok: false, reason: "UNKNOWN" });
  });

  it("rejects an expired link", () => {
    const issued = issueToken("lr_1", 1, "MANAGER", NOW);
    const later = new Date(Date.parse(issued.record.expiresAt) + 1000);

    expect(checkToken([issued.record], issued.raw, expected, later)).toEqual({
      ok: false,
      reason: "EXPIRED",
    });
  });

  it("rejects a second use of the same link", () => {
    // A double-click, a second tab, a replayed request: one decision only.
    const issued = issueToken("lr_1", 1, "MANAGER", NOW);
    const used = { ...issued.record, consumedAt: NOW.toISOString() };

    expect(checkToken([used], issued.raw, expected, NOW)).toEqual({
      ok: false,
      reason: "CONSUMED",
    });
  });

  it("rejects a revoked link", () => {
    const issued = issueToken("lr_1", 1, "MANAGER", NOW);
    const dead = { ...issued.record, revokedAt: NOW.toISOString(), revokedReason: "revisi" };

    expect(checkToken([dead], issued.raw, expected, NOW)).toEqual({
      ok: false,
      reason: "REVOKED",
    });
  });

  it("refuses a manager's link on the CISO's stage", () => {
    const issued = issueToken("lr_1", 1, "MANAGER", NOW);

    expect(
      checkToken([issued.record], issued.raw, { ...expected, stage: "CISO" }, NOW),
    ).toEqual({ ok: false, reason: "WRONG_STAGE" });
  });

  it("refuses a link issued for a version that has since been revised", () => {
    const issued = issueToken("lr_1", 1, "MANAGER", NOW);

    expect(checkToken([issued.record], issued.raw, { ...expected, version: 2 }, NOW)).toEqual({
      ok: false,
      reason: "WRONG_VERSION",
    });
  });

  it("refuses a link from one request used on another", () => {
    const issued = issueToken("lr_1", 1, "MANAGER", NOW);

    expect(
      checkToken([issued.record], issued.raw, { ...expected, requestId: "lr_2" }, NOW),
    ).toEqual({ ok: false, reason: "UNKNOWN" });
  });
});

describe("revoking", () => {
  it("kills every live token for the request and counts them", () => {
    const records = [record(), record(), record({ requestId: "lr_other" })];

    expect(revokeTokens(records, "lr_1", "revisi", NOW)).toBe(2);
    expect(records[0].revokedReason).toBe("revisi");
    // A different request is untouched.
    expect(records[2].revokedAt).toBeUndefined();
  });

  it("leaves already-consumed tokens alone", () => {
    const consumed = record({ consumedAt: "2026-09-16T09:00:00.000Z" });

    expect(revokeTokens([consumed], "lr_1", "revisi", NOW)).toBe(0);
    expect(consumed.revokedAt).toBeUndefined();
  });
});

describe("hashEquals", () => {
  it("is false for different lengths rather than throwing", () => {
    expect(hashEquals("ab", "abcd")).toBe(false);
  });

  it("is true for identical digests", () => {
    const digest = hashToken("x");
    expect(hashEquals(digest, digest)).toBe(true);
  });
});
