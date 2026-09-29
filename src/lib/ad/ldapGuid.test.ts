import { describe, expect, it } from "vitest";

import { guidFromBytes, guidToBytes, isCanonicalGuid } from "./ldapGuid";
import { AdError } from "./types";

/**
 * The byte order is pinned with a literal, not with a round trip.
 *
 * A round trip passes just as happily when both directions are reversed, which
 * is the mistake worth catching: it produces GUIDs that are stable and unique
 * and that no other tool agrees with, and every employee record would be keyed
 * on them before anybody noticed.
 */
const BYTES = Buffer.from([
  0x0c, 0x0d, 0x1e, 0x2f, 0x0a, 0x0b, 0x08, 0x09, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01, 0x00,
]);
const CANONICAL = "2f1e0d0c-0b0a-0908-0706-050403020100";

describe("reading objectGUID", () => {
  it("reverses the first three groups and leaves the rest alone", () => {
    expect(guidFromBytes(BYTES)).toBe(CANONICAL);
  });

  it("refuses anything that is not sixteen bytes", () => {
    // What a driver gets when it asks for objectGUID as text: the bytes,
    // mangled by a UTF-8 decode, at some other length.
    expect(() => guidFromBytes(Buffer.from([1, 2, 3]))).toThrowError(AdError);
  });
});

describe("writing objectGUID into a search", () => {
  it("produces the bytes Active Directory stored", () => {
    expect(guidToBytes(CANONICAL).equals(BYTES)).toBe(true);
  });

  it("accepts the braced spelling and upper case", () => {
    expect(guidToBytes(`{${CANONICAL.toUpperCase()}}`).equals(BYTES)).toBe(true);
  });

  it("refuses a value that is not a GUID rather than searching for nonsense", () => {
    expect(() => guidToBytes("not-a-guid")).toThrowError(AdError);
    expect(isCanonicalGuid("not-a-guid")).toBe(false);
  });

});
