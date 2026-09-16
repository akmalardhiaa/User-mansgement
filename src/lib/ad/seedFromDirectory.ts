import { getAdDriver } from "@/lib/ad";
import { mutateStore } from "@/lib/db/store";
import { accessProfileGroups, accessProfileOu } from "@/lib/lifecycle/accessProfiles";
import { accountNameFor } from "@/lib/lifecycle/plan";

import { AdError } from "./types";

/**
 * Gives the simulated directory something to act on.
 *
 * The demo starts with a roster of employees and an empty directory, which is
 * not a state a real deployment is ever in — there, the accounts exist and the
 * portal is introduced alongside them. Without this, every Movement and
 * Termination fails on a missing object, and what looks like a broken worker is
 * really an empty fixture.
 *
 * Two things happen per employee, and the second is the point: an account is
 * created in the simulated directory, and the employee record is LINKED to it
 * by objectGUID. That link is what execution keys on, and creating accounts
 * without recording it would leave the same failure in place.
 *
 * Refused unless the driver is simulated. Manufacturing accounts in a real
 * directory because a demo fixture looked empty is the worst thing this file
 * could be made to do.
 */

export interface MockSeedReport {
  created: number;
  /** Existing directory objects this roster had simply never been linked to. */
  adopted: number;
  alreadyLinked: number;
}

export async function seedMockAdFromDirectory(): Promise<MockSeedReport> {
  const driver = getAdDriver();

  if (!driver.simulated) {
    throw new AdError(
      "PERMISSION",
      "Seeding hanya boleh dijalankan terhadap direktori simulasi, bukan direktori sungguhan.",
    );
  }

  const report: MockSeedReport = { created: 0, adopted: 0, alreadyLinked: 0 };

  // Read the roster first, outside the write, so account creation is not done
  // while holding the store lock.
  const employees = await mutateStore((draft) => draft.employees.map((employee) => ({ ...employee })));

  const links: Array<{ id: string; objectGUID: string }> = [];

  for (const employee of employees) {
    if (employee.objectGUID) {
      report.alreadyLinked += 1;
      continue;
    }

    const accountName = accountNameFor(employee.email);
    const existing = await driver.findByAccountName(accountName);

    if (existing) {
      links.push({ id: employee.id, objectGUID: existing.objectGUID });
      report.adopted += 1;
      continue;
    }

    const created = await driver.createAccount({
      sAMAccountName: accountName,
      userPrincipalName: employee.email,
      displayName: employee.displayName,
      mail: employee.email,
      department: employee.department,
      title: employee.jobTitle,
      manager: accountNameFor(employee.managerEmail),
      ou: accessProfileOu("standard"),
    });

    // The simulated account mirrors what the roster says is true today: an
    // active employee has a working account, a disabled one does not.
    if (employee.status === "ACTIVE") await driver.enableAccount(created.objectGUID);
    await driver.addGroups(created.objectGUID, accessProfileGroups("standard"));

    links.push({ id: employee.id, objectGUID: created.objectGUID });
    report.created += 1;
  }

  if (links.length > 0) {
    await mutateStore((draft) => {
      for (const link of links) {
        const employee = draft.employees.find((candidate) => candidate.id === link.id);
        if (employee && !employee.objectGUID) employee.objectGUID = link.objectGUID;
      }
    });
  }

  return report;
}
