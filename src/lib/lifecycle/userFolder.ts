import { mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * A folder on disk for each new employee.
 *
 * HC keeps a folder per person — contract, scans, the paperwork that never
 * belongs in a portal — and creating it by hand right after creating the
 * account is the kind of step that gets forgotten for the one person nobody
 * notices until they ask for something. The worker makes it at the same moment
 * it makes the account.
 *
 * Switched on by `USER_FOLDER_ROOT`. Unset, nothing is created and nothing is
 * logged: an installation that has no such folder is not misconfigured, it just
 * does not want this.
 *
 * Under Docker the root is a path INSIDE the container, and something has to be
 * mounted there — see docker-compose.yml, which maps the folder above the
 * project. A path that is not mounted is a folder created inside a container
 * that is thrown away with it, which looks like it worked and leaves nothing
 * behind.
 */

/** What the folder is called: the person's name, as a filesystem will take it. */
export function userFolderName(displayName: string): string {
  const cleaned = displayName
    // Characters Windows refuses outright, plus the path separators.
    .replace(/[\\/:*?"<>|]/g, " ")
    // Control characters would be accepted by some filesystems and by no human.
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // Windows discards a trailing dot or space silently, so the folder would
    // not have the name it was asked for.
    .replace(/[. ]+$/, "");

  // Long enough for any name, short enough to leave room for what goes inside
  // it: Windows still limits the whole path, not just this part of it.
  const capped = cleaned.slice(0, 80).trim();

  // A name made entirely of refused characters would otherwise create the root
  // itself, quietly, and every later employee would share that one folder.
  return capped || "tanpa-nama";
}

/**
 * Creates the folder for somebody who has just been given an account.
 *
 * Returns the path it made, or undefined when the feature is off. Never throws:
 * the account exists by the time this runs, and a request that reported failure
 * because a folder could not be made would send HC looking for a problem with
 * the account instead.
 */
export async function createUserFolder(displayName: string): Promise<string | undefined> {
  const root = process.env.USER_FOLDER_ROOT?.trim();
  if (!root) return undefined;

  const target = path.join(root, userFolderName(displayName));
  try {
    // `recursive` so an existing folder is left exactly as it is — somebody may
    // already have put something in it, and a second onboarding for the same
    // name must not be an error.
    await mkdir(target, { recursive: true });
    return target;
  } catch (error) {
    console.error(`[user-folder] tidak bisa membuat folder untuk ${displayName}`, error);
    return undefined;
  }
}
