import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { employmentCodeRange } from "./employment";
import type { EmploymentType } from "./types";

/**
 * A folder on disk for each new employee, with their details inside it.
 *
 * HC keeps a folder per person — contract, scans, the paperwork that never
 * belongs in a portal — and creating it by hand right after creating the
 * account is the kind of step that gets forgotten for the one person nobody
 * notices until they ask for something. The worker makes it at the same moment
 * it makes the account, and drops a short summary of what was approved into it
 * so the folder is not empty and says who it is for.
 *
 * Switched on by `USER_FOLDER_ROOT`. Unset, nothing is created and nothing is
 * logged: an installation that has no such folder is not misconfigured, it just
 * does not want this.
 *
 * ONE hardcoded path used to live in worker.ts alongside this, writing the same
 * summary to `C:\Users\Asus\Documents\KaryawanBaru`. That worked on exactly one
 * machine. Everywhere else it either created a folder under somebody else's
 * user profile — which Windows refuses without admin rights — or, inside the
 * Linux container the portal used to run in, a directory whose name contained
 * backslashes. Both failures were swallowed and logged, so the feature simply
 * did not happen and said nothing. Hence: one mechanism, one configured root,
 * and a path that is correct on any machine because nothing about the machine
 * is written down here.
 *
 * A relative root is resolved against the application folder, which is where
 * both jalankan.bat and the Windows service start the portal.
 */

/** What goes in the summary. Exactly the approved payload, nothing derived. */
export interface NewEmployeeDetails {
  displayName: string;
  email: string;
  /** The login name. Absent on a request raised before the field existed. */
  userId?: string;
  department: string;
  jobTitle: string;
  employmentType: EmploymentType;
  startDate?: string;
  /** Present for everything except a permanent hire. */
  expiredDate?: string;
  managerName?: string;
}

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

/** The Jakarta day, for the file name and the line at the bottom. */
function jakartaDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
}

function jakartaStamp(now: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(now);
}

/**
 * The summary as HC reads it.
 *
 * The employment type is written with the company's own digit range beside it,
 * taken from employment.ts rather than spelled out again here — the ranges are
 * a rule about the company, and one copy of a rule is the only safe number.
 */
export function employeeSummary(employee: NewEmployeeDetails, now = new Date()): string {
  const rows: Array<[string, string | undefined]> = [
    ["Nama", employee.displayName],
    ["User ID", employee.userId],
    ["Email", employee.email],
    ["Departemen", employee.department],
    ["Jabatan", employee.jobTitle],
    ["Status", `${employee.employmentType} (${employmentCodeRange(employee.employmentType)})`],
    ["Manager", employee.managerName],
    ["Tanggal terakhir bekerja", employee.expiredDate?.slice(0, 10)],
  ];

  const width = Math.max(...rows.map(([label]) => label.length));
  const line = "=".repeat(40);

  return [
    line,
    "DATA KARYAWAN BARU",
    line,
    ...rows
      .filter(([, value]) => value && value.trim())
      .map(([label, value]) => `${label.padEnd(width)} : ${value!.trim()}`),
    line,
    `Dibuat otomatis oleh portal HC User Management, ${jakartaStamp(now)}.`,
    "",
  ].join("\n");
}

/** The summary file's name, inside the person's own folder. */
export function summaryFileName(now = new Date()): string {
  return `data-karyawan-${jakartaDay(now)}.txt`;
}

/**
 * Creates the folder for somebody who has just been given an account, and
 * writes their details into it.
 *
 * Returns the path it made, or undefined when the feature is off. Never throws:
 * the account exists by the time this runs, and a request that reported failure
 * because a folder could not be made would send HC looking for a problem with
 * the account instead. A folder that was made but could not be written into is
 * still returned — the folder is the part HC needs.
 */
export async function createUserFolder(
  employee: NewEmployeeDetails,
  now = new Date(),
): Promise<string | undefined> {
  const root = process.env.USER_FOLDER_ROOT?.trim();
  if (!root) return undefined;

  const target = path.join(root, userFolderName(employee.displayName));
  try {
    // `recursive` so an existing folder is left exactly as it is — somebody may
    // already have put something in it, and a second onboarding for the same
    // name must not be an error.
    await mkdir(target, { recursive: true });
  } catch (error) {
    console.error(
      `[user-folder] tidak bisa membuat folder untuk ${employee.displayName}`,
      error,
    );
    return undefined;
  }

  try {
    await writeFile(path.join(target, summaryFileName(now)), employeeSummary(employee, now), "utf8");
  } catch (error) {
    // The folder is there; only the summary is missing. Worth saying, not worth
    // withholding the path HC is about to be told about.
    console.error(`[user-folder] folder dibuat tetapi ringkasannya gagal ditulis`, error);
  }

  return target;
}
