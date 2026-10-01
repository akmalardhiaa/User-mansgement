import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createUserFolder,
  employeeSummary,
  summaryFileName,
  userFolderName,
  type NewEmployeeDetails,
} from "./userFolder";

/**
 * The folder HC keeps for each person, made at the moment the account is.
 */

let workspace: string;

/** Noon in Jakarta, so the day in the file name cannot drift with the runner. */
const NOW = new Date("2026-09-29T05:00:00.000Z");

const NADIA: NewEmployeeDetails = {
  displayName: "Nadia Kusuma",
  email: "nadiakusuma1@mandirisekuritas.co.id",
  userId: "nadiakusuma1",
  department: "IT — Engineering",
  jobTitle: "Backend Engineer",
  employmentType: "PERMANENT",
  startDate: "2026-10-01",
  managerName: "Bagus Nugroho",
};

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "hc-folder-"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(workspace, { recursive: true, force: true });
});

describe("naming the folder", () => {
  it("uses the person's name as it is written", () => {
    expect(userFolderName("Nadia Kusuma")).toBe("Nadia Kusuma");
  });

  it("drops what a filesystem refuses, rather than failing on it", () => {
    expect(userFolderName('Budi / Santoso: "QA"')).toBe("Budi Santoso QA");
  });

  it("does not end in a dot or a space, which Windows would discard silently", () => {
    expect(userFolderName("Rian Pratama .")).toBe("Rian Pratama");
  });

  it("falls back rather than creating the root itself", () => {
    // A name made entirely of refused characters would otherwise resolve to the
    // root, and every later employee would share that one folder.
    expect(userFolderName("///")).toBe("tanpa-nama");
  });
});

describe("the summary", () => {
  it("writes what was approved, with the company's digit range", () => {
    const text = employeeSummary(NADIA, NOW);

    expect(text).toMatch(/^Nama\s+: Nadia Kusuma$/m);
    // The login name is the thing HC looks this file up for.
    expect(text).toMatch(/^User ID\s+: nadiakusuma1$/m);
    expect(text).toMatch(/^Email\s+: nadiakusuma1@mandirisekuritas\.co\.id$/m);
    expect(text).toMatch(/^Status\s+: PERMANENT \(1-2\)$/m);
    expect(text).toMatch(/^Manager\s+: Bagus Nugroho$/m);
    expect(text).not.toContain("Mulai bekerja");
  });

  it("leaves out a line it has nothing for", () => {
    // A permanent hire has no end date, and a blank last-working-day row is a
    // row HC has to read before deciding it says nothing.
    expect(employeeSummary(NADIA, NOW)).not.toContain("Tanggal terakhir bekerja");

    const contract = { ...NADIA, employmentType: "CONTRACT" as const, expiredDate: "2027-09-29" };
    expect(employeeSummary(contract, NOW)).toContain("Tanggal terakhir bekerja : 2027-09-29");
    expect(employeeSummary(contract, NOW)).toMatch(/^Status\s+: CONTRACT \(3-4\)$/m);
  });

  it("trims an ISO timestamp down to the date", () => {
    const withTime = { ...NADIA, startDate: "2026-10-01T00:00:00.000Z" };

    expect(employeeSummary(withTime, NOW)).not.toContain("Mulai bekerja");
  });

  it("names the file after the Jakarta day, not the machine's", () => {
    // 05:00Z is noon in Jakarta. A UTC-named file would agree here and disagree
    // for anything raised in the evening, which is when most of them are.
    expect(summaryFileName(NOW)).toBe("data-karyawan-2026-09-29.txt");
    expect(summaryFileName(new Date("2026-09-29T20:00:00.000Z"))).toBe(
      "data-karyawan-2026-09-30.txt",
    );
  });
});

describe("creating the folder", () => {
  it("makes one under the configured root, with the details inside it", async () => {
    vi.stubEnv("USER_FOLDER_ROOT", workspace);

    const made = await createUserFolder(NADIA, NOW);

    expect(made).toBe(path.join(workspace, "Nadia Kusuma"));
    expect(await readdir(workspace)).toEqual(["Nadia Kusuma"]);
    expect(await readdir(made!)).toEqual(["data-karyawan-2026-09-29.txt"]);
    expect(await readFile(path.join(made!, "data-karyawan-2026-09-29.txt"), "utf8")).toContain(
      "DATA KARYAWAN BARU",
    );
  });

  it("puts it under the configured root and nowhere else", async () => {
    // The whole point of the change: no path in this module names a machine.
    vi.stubEnv("USER_FOLDER_ROOT", workspace);

    const made = await createUserFolder(NADIA, NOW);

    expect(made?.startsWith(workspace)).toBe(true);
  });

  it("does nothing at all when no root is configured", async () => {
    vi.stubEnv("USER_FOLDER_ROOT", "");

    expect(await createUserFolder(NADIA, NOW)).toBeUndefined();
    expect(await readdir(workspace)).toEqual([]);
  });

  it("leaves an existing folder and whatever is already in it", async () => {
    vi.stubEnv("USER_FOLDER_ROOT", workspace);
    await createUserFolder(NADIA, NOW);
    await writeFile(path.join(workspace, "Nadia Kusuma", "kontrak.txt"), "berkas HC");

    await createUserFolder(NADIA, NOW);

    expect((await readdir(path.join(workspace, "Nadia Kusuma"))).sort()).toEqual([
      "data-karyawan-2026-09-29.txt",
      "kontrak.txt",
    ]);
  });

  it("reports nothing rather than throwing when the root cannot be written", async () => {
    // A file where the root should be: mkdir under it cannot succeed. The
    // account already exists by the time this runs, so this must stay quiet.
    const notADirectory = path.join(workspace, "berkas");
    await writeFile(notADirectory, "bukan folder");
    vi.stubEnv("USER_FOLDER_ROOT", notADirectory);

    await expect(createUserFolder(NADIA, NOW)).resolves.toBeUndefined();
  });
});
