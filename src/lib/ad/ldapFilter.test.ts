import { describe, expect, it } from "vitest";

import { AdError } from "./types";

import {
  accountNameFilter,
  escapeFilterValue,
  groupMembersFilter,
  guidBaseDn,
} from "./ldapFilter";

describe("escaping a filter value", () => {
  it("neutralises the characters that change what a filter means", () => {
    // Unescaped, this account name matches every object in the directory.
    expect(escapeFilterValue("*")).toBe("\\2a");
    expect(escapeFilterValue("x)(objectClass=*")).toBe("x\\29\\28objectClass=\\2a");
  });

  it("escapes a backslash without escaping the escape", () => {
    expect(escapeFilterValue("\\(")).toBe("\\5c\\28");
  });

  it("leaves an ordinary value alone", () => {
    expect(escapeFilterValue("citra.wulandari")).toBe("citra.wulandari");
  });
});

describe("the filters the driver sends", () => {
  it("looks for a person, not a computer account", () => {
    expect(accountNameFilter("citra.wulandari")).toBe(
      "(&(objectCategory=person)(objectClass=user)(sAMAccountName=citra.wulandari))",
    );
  });

  it("carries an escaped account name through", () => {
    expect(accountNameFilter("a*b")).toContain("(sAMAccountName=a\\2ab)");
  });

  it("names an object by GUID through its extended DN, not a binary filter", () => {
    /*
     * Verified against a real domain controller, and the reason this is not a
     * filter any more: the directory answers `(objectGUID=\9c\0b\ae\fe…)`
     * perfectly well, but the escaped bytes do not survive the client
     * library's filter parser — it reads them as characters and re-encodes
     * them as UTF-8. The search then matched nothing, silently.
     */
    expect(guidBaseDn("2F1E0D0C-0B0A-0908-0706-050403020100")).toBe(
      "<GUID=2f1e0d0c-0b0a-0908-0706-050403020100>",
    );
  });

  it("refuses a GUID that is not one, rather than looking up nonsense", () => {
    expect(() => guidBaseDn("bukan-guid")).toThrowError(AdError);
  });

  it("asks for direct members unless nesting is switched on", () => {
    const group = "CN=IT Security Approvers,OU=Groups,DC=corp,DC=example,DC=com";

    expect(groupMembersFilter(group)).toContain(`(memberOf=${group})`);
    expect(groupMembersFilter(group, { nested: true })).toContain(
      `(memberOf:1.2.840.113556.1.4.1941:=${group})`,
    );
  });
});
