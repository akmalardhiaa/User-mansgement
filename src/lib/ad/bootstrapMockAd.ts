import { existsSync } from "node:fs";

import { AdConfigurationError, getAdDriver } from "@/lib/ad";
import { readStore } from "@/lib/db/store";

import { mockAdFilePath } from "./mockAd";
import { seedMockAdFromDirectory } from "./seedFromDirectory";

/** The department whose staff run this portal, as the seed roster spells it. */
const HUMAN_CAPITAL = "Human Capital";

/**
 * Makes a first run demo-complete without anybody running a script.
 *
 * The roster seeds itself on a fresh machine, but the simulated directory did
 * not: it started empty, and every Movement and Termination for one of those
 * employees failed on a missing account. The fix was a script
 * (`npm run mock-ad:roles`) or an endpoint, which is fine when you know it
 * exists and a trap when you have just cloned the repository and run
 * `docker compose up`.
 *
 * Two conditions, and both matter:
 *
 *   - The driver must be the simulated one. Manufacturing accounts in a real
 *     directory because a fixture looked empty is the worst thing this could
 *     do, and `seedMockAdFromDirectory` refuses it too.
 *   - The directory file must not exist yet. A file that exists and holds
 *     nothing is somebody's demo state — perhaps an account was deleted on
 *     purpose to show a failure — and restoring it behind their back would be
 *     its own surprise.
 */
export async function seedMockAdOnFirstRun(): Promise<void> {
  if (existsSync(mockAdFilePath())) return;

  /*
   * A directory this fixture has no business touching, in either of the two
   * ways that happens: a real driver, or a configuration this build cannot
   * make a driver from at all. Both are silent — whatever is wrong with the AD
   * configuration is reported by the first request that actually needs it, and
   * saying it again here, at every boot, would only make a demo fixture look
   * like the problem.
   */
  try {
    if (!getAdDriver().simulated) return;
  } catch (error) {
    if (error instanceof AdConfigurationError) return;
    throw error;
  }

  const report = await seedMockAdFromDirectory();
  if (report.created > 0) {
    console.log(
      `[bootstrap] direktori simulasi diisi dari direktori karyawan: ${report.created} akun dibuat.`,
    );
  }

  await grantPortalAccessToHumanCapital();
}

/**
 * One role group, so the demo can be signed into through the directory.
 *
 * Seeding gives every account the ACCESS groups of the standard profile and no
 * ROLE group at all, which is correct — and means MOCK_AD_LOGIN lets all of
 * them in with an empty role list. The portal is not broken there; it is
 * reporting accurately that nobody has been granted anything. On a first run
 * that reads as a broken demo, because the login page invites an Active
 * Directory account and then refuses every one of them.
 *
 * Only Human Capital, and only the group named by `AD_GROUP_HC`. The DN comes
 * from the configuration rather than a constant, so the directory and the role
 * mapping agree by construction; unset, nothing is granted, because a DN this
 * file invented would map to no role anyway. The other roles are left alone:
 * `npm run mock-ad:roles` grants them when a demo needs them, and a role
 * granted to somebody who never exercises it is noise in the fixture.
 */
async function grantPortalAccessToHumanCapital(): Promise<void> {
  const group = process.env.AD_GROUP_HC?.trim();
  if (!group) return;

  const driver = getAdDriver();
  const { employees } = await readStore();
  const hc = employees.filter(
    (employee) => employee.department === HUMAN_CAPITAL && employee.objectGUID,
  );

  for (const employee of hc) {
    await driver.addGroups(employee.objectGUID!, [group]);
  }

  if (hc.length > 0) {
    console.log(
      `[bootstrap] ${hc.length} akun Human Capital diberi akses portal (${group}).`,
    );
  }
}
