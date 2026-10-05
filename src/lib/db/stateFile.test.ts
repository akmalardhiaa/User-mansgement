import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  StateFileVanishedError,
  createStateFileIfAbsent,
  readStateFile,
  resetSeenStateFiles,
} from "./stateFile";
import { mutateStore, readStore } from "./store";

/**
 * What happened on 22 September 2026, and what must never happen again.
 *
 * The portal's store was momentarily invisible to the Docker container that
 * shares `data/` with Windows. A scheduler read it in that moment, took
 * "missing" to mean "first run", and wrote six seed employees over twenty-eight
 * requests. These pin down the rules that stop that.
 */

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "hc-statefile-"));
  resetSeenStateFiles();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  resetSeenStateFiles();
  await rm(workspace, { recursive: true, force: true });
});

describe("reading a state file", () => {
  it("believes a file is absent on a first run, without waiting", async () => {
    const started = Date.now();
    expect(await readStateFile(path.join(workspace, "never.json"))).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(100);
  });

  it("refuses to call a file absent once it has been seen", async () => {
    const file = path.join(workspace, "store.json");
    await writeFile(file, "{}");
    await readStateFile(file);
    await rm(file);

    await expect(readStateFile(file)).rejects.toBeInstanceOf(StateFileVanishedError);
  });

  it("rides out a file that is only briefly invisible", async () => {
    const file = path.join(workspace, "store.json");
    await writeFile(file, '{"v":1}');
    await readStateFile(file);

    // Gone for a moment — as when it is being replaced — then back.
    await rename(file, `${file}.away`);
    setTimeout(() => void rename(`${file}.away`, file), 120);

    expect(await readStateFile(file)).toBe('{"v":1}');
  });
});

describe("creating a state file", () => {
  it("never overwrites one that exists", async () => {
    const file = path.join(workspace, "store.json");
    await writeFile(file, "the real data");

    expect(await createStateFileIfAbsent(file, "seed data")).toBe(false);
    expect(await readFile(file, "utf8")).toBe("the real data");
  });
});

describe("the portal store, when its file vanishes", () => {
  it("refuses the write instead of seeding an empty store over the real one", async () => {
    const file = path.join(workspace, "hc-store.json");
    vi.stubEnv("HC_DATA_FILE", file);

    // A store with something in it, read by this process.
    await mutateStore((draft) => {
      draft.employees = draft.employees.slice(0, 2);
    });
    await readStore();

    await rm(file);

    await expect(mutateStore(() => undefined)).rejects.toBeInstanceOf(StateFileVanishedError);
    // Nothing was written: no seed store appeared in its place.
    await expect(readFile(file, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("still seeds a genuinely new store on a first run", async () => {
    vi.stubEnv("HC_DATA_FILE", path.join(workspace, "fresh-store.json"));
    vi.stubEnv("AD_DRIVER", "");
    const store = await readStore();
    expect(store.employees.length).toBeGreaterThan(0);
  });
});

describe("the portal store, on a first run against a real directory", () => {
  /*
   * Demo employees beside real ones are not harmless: a movement or a
   * termination can be raised against them, and the worker then goes looking
   * for an account no domain controller holds.
   */
  it("starts with no employees when AD_DRIVER=ldap", async () => {
    vi.stubEnv("HC_DATA_FILE", path.join(workspace, "ldap-store.json"));
    vi.stubEnv("AD_DRIVER", "ldap");
    const store = await readStore();
    expect(store.employees).toEqual([]);
  });

  it("starts with no employees in production", async () => {
    vi.stubEnv("HC_DATA_FILE", path.join(workspace, "production-store.json"));
    vi.stubEnv("AD_DRIVER", "");
    vi.stubEnv("NODE_ENV", "production");
    const store = await readStore();
    expect(store.employees).toEqual([]);
  });

  it("leaves an existing store's employees alone", async () => {
    const file = path.join(workspace, "existing-store.json");
    await writeFile(file, JSON.stringify({ employees: [{ id: "kept" }] }));
    vi.stubEnv("HC_DATA_FILE", file);
    vi.stubEnv("AD_DRIVER", "ldap");
    const store = await readStore();
    expect(store.employees.map((employee) => employee.id)).toEqual(["kept"]);
  });
});
