import { afterEach, describe, expect, it, vi } from "vitest";

import { isRoleMappingConfigured, rolesFromGroups } from "./roleMapping";

/**
 * Which AD groups confer which authority.
 *
 * This is the whole of the portal's authorisation input: everything downstream
 * — who may raise a request, who may approve which stage — is decided from the
 * roles this function returns. It had no tests, and the matching rule it used
 * was a bare substring, so the cases below are not hypothetical tidiness. They
 * are the ways somebody ends up holding a role nobody granted them.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

const ADMIN_DN = "CN=HC Admins,OU=Groups,DC=corp,DC=example,DC=com";

describe("a group that merely reads alike", () => {
  it("does not confer the real group's authority", () => {
    // The regression this file exists for. `CN=HC Admins` is a substring of
    // `CN=Former HC Admins`, so membership of an ARCHIVED group used to grant
    // SYSTEM_ADMIN — the one role that configures the portal.
    vi.stubEnv("AD_GROUP_ADMIN", "CN=HC Admins");

    expect(
      rolesFromGroups(["CN=Former HC Admins,OU=Archive,DC=corp,DC=example,DC=com"]),
    ).toEqual([]);
  });

  it("does not match a group whose name merely starts the same", () => {
    vi.stubEnv("AD_GROUP_ADMIN", "CN=HC Admins");

    expect(
      rolesFromGroups(["CN=HC Admins Read-Only,OU=Groups,DC=corp,DC=example,DC=com"]),
    ).toEqual([]);
  });

  it("does not match the configured name sitting in a different attribute", () => {
    // `HC Admins` as an organisational unit is not `HC Admins` the group.
    vi.stubEnv("AD_GROUP_ADMIN", "HC Admins");

    expect(rolesFromGroups(["CN=Interns,OU=HC Admins,DC=corp"])).toEqual([]);
  });
});

describe("the forms an operator may configure", () => {
  it("accepts the full distinguished name", () => {
    vi.stubEnv("AD_GROUP_ADMIN", ADMIN_DN);

    expect(rolesFromGroups([ADMIN_DN])).toEqual(["SYSTEM_ADMIN"]);
  });

  it("accepts a leading part of it", () => {
    vi.stubEnv("AD_GROUP_ADMIN", "CN=HC Admins");

    expect(rolesFromGroups([ADMIN_DN])).toEqual(["SYSTEM_ADMIN"]);
  });

  it("accepts the bare common name", () => {
    vi.stubEnv("AD_GROUP_ADMIN", "HC Admins");

    expect(rolesFromGroups([ADMIN_DN])).toEqual(["SYSTEM_ADMIN"]);
  });

  it("ignores case, because AD does", () => {
    vi.stubEnv("AD_GROUP_ADMIN", "cn=hc ADMINS");

    expect(rolesFromGroups([ADMIN_DN])).toEqual(["SYSTEM_ADMIN"]);
  });

  it("tolerates the space AD sometimes puts after a comma", () => {
    vi.stubEnv("AD_GROUP_ADMIN", "CN=HC Admins, OU=Groups");

    expect(rolesFromGroups(["CN=HC Admins,OU=Groups,DC=corp"])).toEqual(["SYSTEM_ADMIN"]);
  });
});

describe("holding more than one hat", () => {
  it("returns every role the person's groups map to", () => {
    // Separation of duties is enforced per decision, not by pretending nobody
    // can hold two roles — so this has to be visible to the layers above.
    vi.stubEnv("AD_GROUP_MANAGER", "CN=Division Managers");
    vi.stubEnv("AD_GROUP_CISO", "CN=IT Security Approvers");

    const roles = rolesFromGroups([
      "CN=Division Managers,OU=Groups,DC=corp",
      "CN=IT Security Approvers,OU=Groups,DC=corp",
    ]);

    expect(roles).toContain("MANAGER");
    expect(roles).toContain("CISO_APPROVER");
    expect(roles).toHaveLength(2);
  });

  it("names a role once even when two settings both match it", () => {
    // LDAP_ADMIN_GROUP is an alias for AD_GROUP_ADMIN; a deployment that sets
    // both must not end up with SYSTEM_ADMIN listed twice.
    vi.stubEnv("AD_GROUP_ADMIN", "CN=HC Admins");
    vi.stubEnv("LDAP_ADMIN_GROUP", "CN=HC Admins");

    expect(rolesFromGroups([ADMIN_DN])).toEqual(["SYSTEM_ADMIN"]);
  });
});

describe("the deployment that predates AD_GROUP_ADMIN", () => {
  it("still honours LDAP_ADMIN_GROUP on its own", () => {
    vi.stubEnv("LDAP_ADMIN_GROUP", "CN=HC Admins");

    expect(rolesFromGroups([ADMIN_DN])).toEqual(["SYSTEM_ADMIN"]);
  });

  it("does not let the alias confer any role but SYSTEM_ADMIN", () => {
    vi.stubEnv("LDAP_ADMIN_GROUP", "CN=Everyone");

    expect(rolesFromGroups(["CN=Everyone,OU=Groups,DC=corp"])).toEqual(["SYSTEM_ADMIN"]);
  });
});

describe("somebody in none of the mapped groups", () => {
  it("gets no roles at all", () => {
    // A valid employee who signs in, sees their own profile, and nothing else.
    // Being in AD proves identity; it grants no authority here.
    vi.stubEnv("AD_GROUP_HC", "CN=HC Officers");

    expect(rolesFromGroups(["CN=All Staff,OU=Groups,DC=corp"])).toEqual([]);
  });

  it("gets no roles when nothing is configured", () => {
    expect(rolesFromGroups([ADMIN_DN])).toEqual([]);
  });

  it("survives an empty memberOf", () => {
    vi.stubEnv("AD_GROUP_HC", "CN=HC Officers");

    expect(rolesFromGroups([])).toEqual([]);
  });
});

describe("whether anybody can do anything at all", () => {
  it("reports a deployment with no group configured", () => {
    // Not broken, but nobody can do anything — worth being able to say so on a
    // status screen rather than leaving an operator to guess.
    expect(isRoleMappingConfigured()).toBe(false);
  });

  it("reports one configured through the alias", () => {
    vi.stubEnv("LDAP_ADMIN_GROUP", "CN=HC Admins");

    expect(isRoleMappingConfigured()).toBe(true);
  });

  it("ignores a setting that is only whitespace", () => {
    vi.stubEnv("AD_GROUP_HC", "   ");

    expect(isRoleMappingConfigured()).toBe(false);
  });
});
