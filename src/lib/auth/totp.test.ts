import { describe, expect, it } from "vitest";

import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  matchTotp,
  otpauthUri,
  stepAt,
  totpCode,
} from "./totp";

// RFC 6238 appendix B, SHA-1 column. The RFC prints eight digits; an
// authenticator shows the last six of the same number.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));
const RFC_VECTORS: Array<[number, string]> = [
  [59, "287082"],
  [1111111109, "081804"],
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
  [20000000000, "353130"],
];

describe("totp", () => {
  it("encodes the RFC secret the way authenticator apps expect", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(RFC_SECRET).toString("ascii")).toBe("12345678901234567890");
  });

  it.each(RFC_VECTORS)("matches RFC 6238 at T=%i", (seconds, code) => {
    expect(totpCode(RFC_SECRET, stepAt(seconds * 1000))).toBe(code);
  });

  it("accepts the current code, and one step either side, and nothing further", () => {
    const now = 1_700_000_000_000;
    const step = stepAt(now);
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step), now)).toBe(step);
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), now)).toBe(step + 1);
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), now)).toBeUndefined();
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 2), now)).toBeUndefined();
  });

  it("tolerates spaces but nothing that is not six digits", () => {
    const now = 1_700_000_000_000;
    const code = totpCode(RFC_SECRET, stepAt(now));
    expect(matchTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, now)).toBe(stepAt(now));
    expect(matchTotp(RFC_SECRET, "12345", now)).toBeUndefined();
    expect(matchTotp(RFC_SECRET, "abcdef", now)).toBeUndefined();
    expect(matchTotp(RFC_SECRET, "", now)).toBeUndefined();
  });

  it("makes 160-bit secrets that round-trip", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
    expect(generateTotpSecret()).not.toBe(secret);
  });

  it("builds an otpauth link with the issuer in both places", () => {
    const uri = otpauthUri("HC Portal", "ayu.prameswari", "ABC234");
    expect(uri.startsWith("otpauth://totp/HC%20Portal%3Aayu.prameswari?")).toBe(true);
    const params = new URL(uri).searchParams;
    expect(params.get("secret")).toBe("ABC234");
    expect(params.get("issuer")).toBe("HC Portal");
    expect(params.get("digits")).toBe("6");
    expect(params.get("period")).toBe("30");
  });
});
