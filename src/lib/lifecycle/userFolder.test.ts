import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createUserFolder, userFolderName } from "./userFolder";

/**
 * The folder HC keeps for each person, made at the moment the account is.
 */

let workspace: string;

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

describe("creating the folder", () => {
  it("makes one under the configured root", async () => {
    vi.stubEnv("USER_FOLDER_ROOT", workspace);

    const made = await createUserFolder("Nadia Kusuma");

    expect(made).toBe(path.join(workspace, "Nadia Kusuma"));
    expect(await readdir(workspace)).toEqual(["Nadia Kusuma"]);
  });

  it("does nothing at all when no root is configured", async () => {
    vi.stubEnv("USER_FOLDER_ROOT", "");

    expect(await createUserFolder("Nadia Kusuma")).toBeUndefined();
    expect(await readdir(workspace)).toEqual([]);
  });

  it("leaves an existing folder and whatever is already in it", async () => {
    vi.stubEnv("USER_FOLDER_ROOT", workspace);
    await createUserFolder("Nadia Kusuma");
    await writeFile(path.join(workspace, "Nadia Kusuma", "kontrak.txt"), "berkas HC");

    await createUserFolder("Nadia Kusuma");

    expect(await readdir(path.join(workspace, "Nadia Kusuma"))).toEqual(["kontrak.txt"]);
  });

  it("reports nothing rather than throwing when the root cannot be written", async () => {
    // A file where the root should be: mkdir under it cannot succeed. The
    // account already exists by the time this runs, so this must stay quiet.
    const notADirectory = path.join(workspace, "berkas");
    await writeFile(notADirectory, "bukan folder");
    vi.stubEnv("USER_FOLDER_ROOT", notADirectory);

    await expect(createUserFolder("Nadia Kusuma")).resolves.toBeUndefined();
  });
});
