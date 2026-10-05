import { AdError } from "./types";

/**
 * Active Directory's objectGUID, in both directions.
 *
 * The attribute is a 16-byte binary value, and the string form everybody writes
 * it in is NOT a straight hex dump of those bytes. Microsoft stores the first
 * three fields of the GUID little-endian, the way a Windows `GUID` struct sits
 * in memory, and the last two big-endian. So the account whose GUID is printed
 * as `2f1e0d0c-0b0a-0908-0706-050403020100` is stored as bytes
 * `0c 0d 1e 2f 0a 0b 08 09 07 06 05 04 03 02 01 00`.
 *
 * Getting this wrong does not fail loudly. It produces a GUID string that is
 * well-formed, unique and stable — and that no other tool agrees with. Every
 * employee record in this application is keyed on that string, so a byte-order
 * mistake discovered later cannot be corrected without re-reading the directory
 * for every person in it. Hence a module of its own, and tests that pin the
 * order rather than merely round-tripping (a round trip passes happily with the
 * bytes reversed both ways).
 *
 * The canonical form produced here is lower-case and unbraced — the shape
 * `randomUUID()` produces, and the shape every GUID already in the store has,
 * including those written while this portal still had a simulated directory.
 */

const GUID_BYTES = 16;

/** Byte index for each position of the canonical string, in order. */
const CANONICAL_ORDER = [3, 2, 1, 0, 5, 4, 7, 6, 8, 9, 10, 11, 12, 13, 14, 15];

const CANONICAL_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function hex(value: number): string {
  return value.toString(16).padStart(2, "0");
}

/** Whether a string is an objectGUID as this application stores one. */
export function isCanonicalGuid(value: string): boolean {
  return CANONICAL_PATTERN.test(value.trim().toLowerCase());
}

/**
 * The canonical GUID string for the bytes Active Directory returned.
 *
 * Anything that is not exactly sixteen bytes is a decoding problem rather than
 * a directory problem — an attribute requested as text and handed back as a
 * UTF-8 mangling of the binary, most likely — so it says so instead of
 * returning a plausible-looking GUID.
 */
export function guidFromBytes(bytes: Buffer | Uint8Array): string {
  if (bytes.length !== GUID_BYTES) {
    throw new AdError(
      "UNKNOWN",
      `objectGUID harus ${GUID_BYTES} byte, diterima ${bytes.length}. Atribut ini wajib dibaca sebagai biner.`,
    );
  }

  const digits = CANONICAL_ORDER.map((index) => hex(bytes[index]));
  return [
    digits.slice(0, 4).join(""),
    digits.slice(4, 6).join(""),
    digits.slice(6, 8).join(""),
    digits.slice(8, 10).join(""),
    digits.slice(10, 16).join(""),
  ].join("-");
}

/** The sixteen bytes for a canonical GUID string. */
export function guidToBytes(guid: string): Buffer {
  const cleaned = guid.trim().toLowerCase().replace(/^\{|\}$/g, "");
  if (!isCanonicalGuid(cleaned)) {
    throw new AdError("UNKNOWN", `objectGUID "${guid}" bukan GUID yang sah, jadi tidak bisa dicari.`);
  }

  const digits = cleaned.replace(/-/g, "");
  const bytes = Buffer.alloc(GUID_BYTES);
  CANONICAL_ORDER.forEach((target, position) => {
    bytes[target] = Number.parseInt(digits.slice(position * 2, position * 2 + 2), 16);
  });
  return bytes;
}

