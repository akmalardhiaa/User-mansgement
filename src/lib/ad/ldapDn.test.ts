import { describe, expect, it } from "vitest";

import {
  containerOf,
  dnEquals,
  escapeDnValue,
  isManaged,
  isWithin,
  normaliseDn,
  rdnOf,
  splitDn,
} from "./ldapDn";

const KARYAWAN = "OU=Karyawan,DC=corp,DC=example,DC=com";

describe("splitting a DN", () => {
  it("does not split on a comma inside a value", () => {
    expect(splitDn(`CN=Wulandari\\, Citra,${KARYAWAN}`)).toEqual([
      "CN=Wulandari\\, Citra",
      "OU=Karyawan",
      "DC=corp",
      "DC=example",
      "DC=com",
    ]);
  });

  it("ignores the spacing a directory happens to emit", () => {
    expect(normaliseDn("CN=Citra, OU=Karyawan , DC=corp")).toBe("cn=citra,ou=karyawan,dc=corp");
    expect(dnEquals("CN=Citra,OU=Karyawan", "cn=citra, ou=karyawan")).toBe(true);
  });
});

describe("the container an object sits in", () => {
  it("is everything but the object's own component", () => {
    expect(containerOf(`CN=Citra Wulandari,OU=Engineering,${KARYAWAN}`)).toBe(
      `OU=Engineering,${KARYAWAN}`,
    );
    expect(rdnOf(`CN=Citra Wulandari,OU=Engineering,${KARYAWAN}`)).toBe("CN=Citra Wulandari");
  });
});

describe("containment", () => {
  it("compares whole components, so a similar name is not a match", () => {
    expect(isWithin(`CN=Citra,${KARYAWAN}`, KARYAWAN)).toBe(true);
    expect(isWithin("CN=Citra,OU=Ex-Karyawan,DC=corp,DC=example,DC=com", KARYAWAN)).toBe(false);
  });

  it("does not place an object inside itself", () => {
    expect(isWithin(KARYAWAN, KARYAWAN)).toBe(false);
  });

  it("treats a managed OU as writable, and everything outside it as not", () => {
    const managed = [KARYAWAN, "OU=Karantina,DC=corp,DC=example,DC=com"];

    expect(isManaged(`CN=Citra,OU=Engineering,${KARYAWAN}`, managed)).toBe(true);
    // The OU a new account is created in is named by the catalogue, so the
    // container itself has to count as managed.
    expect(isManaged(KARYAWAN, managed)).toBe(true);
    expect(isManaged("CN=Administrator,CN=Users,DC=corp,DC=example,DC=com", managed)).toBe(false);
  });

  it("permits nothing when no OU has been configured", () => {
    expect(isManaged(`CN=Citra,${KARYAWAN}`, [])).toBe(false);
  });
});

describe("escaping a value into a DN", () => {
  it("escapes the characters that would end the component", () => {
    expect(escapeDnValue("Wulandari, Citra")).toBe("Wulandari\\, Citra");
    expect(escapeDnValue("a+b")).toBe("a\\+b");
  });

  it("escapes a leading hash and a trailing space", () => {
    expect(escapeDnValue("#hash")).toBe("\\#hash");
    expect(escapeDnValue("trailing ")).toBe("trailing\\ ");
  });
});
