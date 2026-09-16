import { describe, expect, it } from "vitest";

import { accessProfileGroups, quarantineOu } from "./accessProfiles";
import { accountNameFor, buildPlan, type StepKey } from "./plan";
import type { MovementPayload, OnboardingPayload, TerminationPayload } from "./types";

const onboarding: OnboardingPayload = {
  kind: "ONBOARDING",
  nik: "2026001",
  firstName: "Citra",
  lastName: "Wulandari",
  displayName: "Citra Wulandari",
  email: "citra.wulandari@example.com",
  jobTitle: "Backend Engineer",
  department: "IT — Engineering",
  employmentType: "PERMANENT",
  locationType: "PUSAT",
  managerName: "Sarah Wijaya",
  managerEmail: "sarah.wijaya@example.com",
  startDate: "2026-10-01",
  accessProfileId: "engineering",
};

const movement: MovementPayload = {
  kind: "MOVEMENT",
  employeeId: "emp_seed_002",
  toDepartment: "IT — Security",
  toJobTitle: "Security Engineer",
  toManagerName: "Bagus Nugroho",
  toManagerEmail: "bagus.nugroho@example.com",
  accessProfileId: "security",
  reason: "Rotasi internal.",
};

const termination: TerminationPayload = {
  kind: "TERMINATION",
  employeeId: "emp_seed_002",
  reasonCategory: "RESIGN",
  lastWorkingDate: "2026-10-31",
};

function keys(steps: Array<{ key: StepKey }>): StepKey[] {
  return steps.map((step) => step.key);
}

describe("onboarding order", () => {
  it("creates the account before anything else and enables it last", () => {
    const plan = buildPlan(onboarding);

    expect(keys(plan.steps)[0]).toBe("create-account");
    expect(keys(plan.steps).at(-1)).toBe("enable-account");
  });

  it("grants groups and verifies BEFORE enabling", () => {
    // Stopping anywhere before the final step must leave an account that exists
    // but cannot be used. Enabling earlier would open a window in which somebody
    // holds a working account nobody had finished authorising.
    const order = keys(buildPlan(onboarding).steps);

    expect(order.indexOf("grant-groups")).toBeLessThan(order.indexOf("enable-account"));
    expect(order.indexOf("verify")).toBeLessThan(order.indexOf("enable-account"));
  });

  it("requires the profile's groups afterwards", () => {
    expect(buildPlan(onboarding).postconditions).toMatchObject({
      enabled: true,
      requiredGroups: accessProfileGroups("engineering"),
    });
  });
});

describe("termination order", () => {
  it("disables the account as the very first action", () => {
    // If the job dies after step one, access is already gone and the tidying up
    // can be finished later. Revoking groups first would leave a working
    // account with fewer permissions, which is not what was asked for.
    expect(keys(buildPlan(termination).steps)[0]).toBe("disable-account");
  });

  it("moves to quarantine rather than deleting", () => {
    const plan = buildPlan(termination);

    expect(keys(plan.steps)).toContain("move-ou");
    expect(plan.steps.find((step) => step.key === "move-ou")?.params.ou).toBe(quarantineOu());
    expect(plan.postconditions.enabled).toBe(false);
  });

  it("only revokes groups this application issued", () => {
    const plan = buildPlan(termination, {
      groups: [...accessProfileGroups("engineering"), "CN=Manual-VPN,OU=Groups,DC=corp,DC=example,DC=com"],
    });
    const revoked = plan.steps.find((step) => step.key === "revoke-groups")?.params.groups;

    // A membership somebody added by hand is not ours to remove.
    expect(revoked).not.toContain("CN=Manual-VPN,OU=Groups,DC=corp,DC=example,DC=com");
    expect(revoked).toEqual(accessProfileGroups("engineering"));
  });
});

describe("movement order", () => {
  it("revokes old access before granting new", () => {
    const order = keys(buildPlan(movement, { groups: accessProfileGroups("engineering") }).steps);

    expect(order.indexOf("revoke-groups")).toBeLessThan(order.indexOf("grant-groups"));
  });

  it("keeps groups the new profile also needs", () => {
    // Both profiles carry the base group. Revoking it only to grant it again
    // would be a pointless window with no access at all.
    const plan = buildPlan(movement, { groups: accessProfileGroups("engineering") });
    const revoked = plan.steps.find((step) => step.key === "revoke-groups")?.params.groups ?? [];

    for (const group of accessProfileGroups("security")) {
      expect(revoked).not.toContain(group);
    }
  });

  it("leaves unmanaged groups alone", () => {
    const plan = buildPlan(movement, {
      groups: ["CN=Manual-VPN,OU=Groups,DC=corp,DC=example,DC=com"],
    });
    const revoked = plan.steps.find((step) => step.key === "revoke-groups")?.params.groups ?? [];

    expect(revoked).toEqual([]);
  });

  it("ends by reading the directory back", () => {
    expect(keys(buildPlan(movement).steps).at(-1)).toBe("verify");
  });
});

describe("account naming", () => {
  it("derives a directory account name from the address", () => {
    expect(accountNameFor("citra.wulandari@example.com")).toBe("citra.wulandari");
  });

  it("strips anything a directory would not accept", () => {
    expect(accountNameFor("Budi+Tag@example.com")).toBe("buditag");
  });
});
