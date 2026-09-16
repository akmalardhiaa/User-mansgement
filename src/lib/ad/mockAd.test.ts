import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MockAdDriver, readMockDirectory } from "./mockAd";
import { AdError } from "./types";

let workspace: string;
let driver: MockAdDriver;

const SPEC = {
  sAMAccountName: "citra.wulandari",
  userPrincipalName: "citra.wulandari@corp.example.com",
  displayName: "Citra Wulandari",
  mail: "citra.wulandari@example.com",
  department: "IT — Engineering",
  title: "Backend Engineer",
  ou: "OU=Engineering,OU=Karyawan,DC=corp,DC=example,DC=com",
};

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "hc-mockad-"));
  process.env.AD_MOCK_FILE = path.join(workspace, "mock-ad.json");
  driver = new MockAdDriver();
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe("creating accounts", () => {
  it("always creates them disabled", async () => {
    const created = await driver.createAccount(SPEC);

    // An account that works before its access has been granted and verified is
    // a window nobody authorised.
    expect(created.enabled).toBe(false);
    expect(created.groups).toEqual([]);
    expect(created.objectGUID).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("refuses a second account with the same name", async () => {
    await driver.createAccount(SPEC);

    await expect(driver.createAccount(SPEC)).rejects.toMatchObject({ kind: "CONFLICT" });
  });
});

describe("group operations are safe to repeat", () => {
  it("adding a group somebody already holds is not an error", async () => {
    // A retry has to be able to re-run a step it already completed.
    const created = await driver.createAccount(SPEC);
    await driver.addGroups(created.objectGUID, ["CN=A", "CN=B"]);
    await driver.addGroups(created.objectGUID, ["CN=B", "CN=C"]);

    const after = await driver.findByGuid(created.objectGUID);
    expect(after?.groups).toEqual(["CN=A", "CN=B", "CN=C"]);
  });

  it("removing a group that is already gone is not an error", async () => {
    const created = await driver.createAccount(SPEC);
    await driver.addGroups(created.objectGUID, ["CN=A"]);
    await driver.removeGroups(created.objectGUID, ["CN=A"]);
    await driver.removeGroups(created.objectGUID, ["CN=A"]);

    expect((await driver.findByGuid(created.objectGUID))?.groups).toEqual([]);
  });
});

describe("fault injection", () => {
  it("reports a transient fault as retryable, and succeeds once it clears", async () => {
    driver.setFault({ kind: "transient", count: 2 });

    await expect(driver.createAccount(SPEC)).rejects.toMatchObject({ kind: "TRANSIENT" });
    await expect(driver.createAccount(SPEC)).rejects.toMatchObject({ kind: "TRANSIENT" });

    const created = await driver.createAccount(SPEC);
    expect(created.sAMAccountName).toBe("citra.wulandari");
  });

  it("marks a permission failure as never worth retrying", async () => {
    driver.setFault({ kind: "permission" });

    const error = await driver.createAccount(SPEC).catch((cause: AdError) => cause);
    expect(error).toBeInstanceOf(AdError);
    expect((error as AdError).kind).toBe("PERMISSION");
    expect((error as AdError).retryable).toBe(false);
  });

  it("fails group operations while letting everything else through", async () => {
    // The shape that produces the case worth rehearsing: an account created but
    // never granted its access.
    const created = await driver.createAccount(SPEC);
    driver.setFault({ kind: "partial-groups" });

    await driver.setAttributes(created.objectGUID, { title: "Staff Engineer" });
    await expect(driver.addGroups(created.objectGUID, ["CN=A"])).rejects.toThrow(AdError);

    const after = await driver.findByGuid(created.objectGUID);
    expect(after?.title).toBe("Staff Engineer");
    expect(after?.groups).toEqual([]);
    // And critically, it is still disabled.
    expect(after?.enabled).toBe(false);
  });

  it("fails reads as well as writes", async () => {
    // A worker that only handles write failures crashes on the first read that
    // throws, and a directory refuses reads just as readily.
    const created = await driver.createAccount(SPEC);
    driver.setFault({ kind: "permission" });

    await expect(driver.findByGuid(created.objectGUID)).rejects.toMatchObject({
      kind: "PERMISSION",
    });
    await expect(driver.findByAccountName("citra.wulandari")).rejects.toMatchObject({
      kind: "PERMISSION",
    });
  });

  it("applies the write before reporting a timeout, so a read-back can find it", async () => {
    const created = await driver.createAccount(SPEC);
    driver.setFault({ kind: "timeout-after-write" });

    const error = await driver
      .disableAccount(created.objectGUID)
      .catch((cause: AdError) => cause);

    expect((error as AdError).kind).toBe("TIMEOUT_AFTER_WRITE");
    // Not retryable: the change may well have landed, and it did. Sending it
    // again blind is exactly what must not happen.
    expect((error as AdError).retryable).toBe(false);
    expect((await driver.findByGuid(created.objectGUID))?.enabled).toBe(false);
  });
});

describe("the simulated directory is its own system", () => {
  it("persists across driver instances", async () => {
    await driver.createAccount(SPEC);

    // A second worker process reads the same directory.
    const other = new MockAdDriver();
    expect(await other.findByAccountName("citra.wulandari")).toBeDefined();
    expect(await readMockDirectory()).toHaveLength(1);
  });

  it("can be changed underneath the application, which is what drift is", async () => {
    const created = await driver.createAccount(SPEC);
    const other = new MockAdDriver();
    await other.setAttributes(created.objectGUID, { department: "Finance" });

    expect((await driver.findByGuid(created.objectGUID))?.department).toBe("Finance");
  });
});
