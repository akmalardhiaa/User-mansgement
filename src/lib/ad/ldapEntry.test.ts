import { describe, expect, it } from "vitest";

import {
  accountFromEntry,
  isEnabled,
  managedGroupsOf,
  parseUserAccountControl,
  withEnabled,
  type DirectoryEntry,
} from "./ldapEntry";
import { guidToBytes } from "./ldapGuid";
import { AdError } from "./types";

const NORMAL_ACCOUNT = 0x200;
const ACCOUNTDISABLE = 0x2;
const DONT_EXPIRE_PASSWORD = 0x10000;
const SMARTCARD_REQUIRED = 0x40000;

const BASE_GROUP = "CN=HC-Base,OU=Groups,DC=corp,DC=example,DC=com";
const ENGINEERING_GROUP = "CN=HC-Engineering,OU=Groups,DC=corp,DC=example,DC=com";
const CATALOGUE = [BASE_GROUP, ENGINEERING_GROUP];

describe("userAccountControl", () => {
  it("reads the disable bit and nothing else", () => {
    expect(isEnabled(NORMAL_ACCOUNT)).toBe(true);
    expect(isEnabled(NORMAL_ACCOUNT | ACCOUNTDISABLE)).toBe(false);
    expect(isEnabled(NORMAL_ACCOUNT | SMARTCARD_REQUIRED)).toBe(true);
  });

  it("keeps every other flag when it moves that bit", () => {
    const flags = NORMAL_ACCOUNT | DONT_EXPIRE_PASSWORD | SMARTCARD_REQUIRED;

    // Writing a flat 514 to disable an account is a one-line way to strip
    // "password never expires" and "smartcard required" from it.
    expect(withEnabled(flags, false)).toBe(flags | ACCOUNTDISABLE);
    expect(withEnabled(flags | ACCOUNTDISABLE, true)).toBe(flags);
  });

  it("is idempotent, so a repeated step writes the same value", () => {
    expect(withEnabled(NORMAL_ACCOUNT, true)).toBe(NORMAL_ACCOUNT);
    expect(withEnabled(NORMAL_ACCOUNT | ACCOUNTDISABLE, false)).toBe(
      NORMAL_ACCOUNT | ACCOUNTDISABLE,
    );
  });

  it("refuses an unreadable value rather than assuming the account is live", () => {
    expect(() => parseUserAccountControl(undefined)).toThrowError(AdError);
    expect(() => parseUserAccountControl("")).toThrowError(AdError);
    expect(parseUserAccountControl(["512"])).toBe(512);
  });
});

describe("which groups count", () => {
  it("keeps only what the catalogue issues", () => {
    const held = [BASE_GROUP, "CN=Domain Admins,CN=Users,DC=corp,DC=example,DC=com"];

    expect(managedGroupsOf(held, CATALOGUE)).toEqual([BASE_GROUP]);
  });

  it("returns the catalogue spelling, not the directory's", () => {
    // The verification step compares these against the plan's postconditions
    // with ===, so "CN=HC-Base, OU=Groups, ..." would fail over two spaces.
    const held = ["cn=hc-base, ou=groups, dc=corp, dc=example, dc=com"];

    expect(managedGroupsOf(held, CATALOGUE)).toEqual([BASE_GROUP]);
  });

  it("sorts, so two reads of the same account compare equal", () => {
    expect(managedGroupsOf([ENGINEERING_GROUP, BASE_GROUP], CATALOGUE)).toEqual([
      BASE_GROUP,
      ENGINEERING_GROUP,
    ]);
  });
});

describe("mapping an entry", () => {
  const entry: DirectoryEntry = {
    dn: "CN=Dewi Lestari,OU=Engineering,OU=Karyawan,DC=corp,DC=example,DC=com",
    objectGUID: guidToBytes("2f1e0d0c-0b0a-0908-0706-050403020100"),
    distinguishedName: "CN=Dewi Lestari,OU=Engineering,OU=Karyawan,DC=corp,DC=example,DC=com",
    sAMAccountName: "dewi.lestari",
    userPrincipalName: "dewi.lestari@corp.example.com",
    displayName: "Dewi Lestari",
    mail: "dewi.lestari@example.com",
    department: "IT — Security",
    title: "Security Analyst",
    manager: "CN=Bagus Nugroho,OU=Karyawan,DC=corp,DC=example,DC=com",
    userAccountControl: "512",
    memberOf: [BASE_GROUP],
  };

  it("derives the OU from the DN rather than expecting an attribute for it", () => {
    const state = accountFromEntry(entry, { managedGroups: CATALOGUE, manager: "bagus.nugroho" });

    expect(state.ou).toBe("OU=Engineering,OU=Karyawan,DC=corp,DC=example,DC=com");
    expect(state.objectGUID).toBe("2f1e0d0c-0b0a-0908-0706-050403020100");
    expect(state.enabled).toBe(true);
    expect(state.groups).toEqual([BASE_GROUP]);
  });

  it("reports the manager as the account name it was given, not as a DN", () => {
    const state = accountFromEntry(entry, { managedGroups: CATALOGUE, manager: "bagus.nugroho" });

    expect(state.manager).toBe("bagus.nugroho");
  });

  it("refuses an objectGUID that did not come back as bytes", () => {
    // What a driver gets when it forgets to request the attribute as binary.
    const mangled = { ...entry, objectGUID: "\u0000\u0001mangled" };

    expect(() => accountFromEntry(mangled, { managedGroups: CATALOGUE })).toThrowError(AdError);
  });
});
