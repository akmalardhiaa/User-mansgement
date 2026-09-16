import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  AdError,
  type AdAccountState,
  type AdAttributePatch,
  type AdCreateSpec,
  type AdDriver,
} from "./types";

/**
 * A simulated directory.
 *
 * It lives in its own file, deliberately. Active Directory is a separate system
 * with its own source of truth, and the single most important thing the worker
 * has to cope with is the two disagreeing — an administrator moved somebody, a
 * previous run half-finished, an object was changed outside this application.
 * Keeping the simulated directory inside the portal's own store would make
 * drift unrepresentable, and drift is exactly what needs rehearsing.
 *
 * Faults are injectable because the failure paths are the ones worth
 * demonstrating. The plan's acceptance criteria are not "it works" — they are
 * that a partial failure leaves the account safe, a timeout after a write does
 * not double-apply, and an object changed underneath is noticed rather than
 * overwritten.
 */

export type FaultMode =
  | { kind: "none" }
  /** Fails the next `count` operations with a retryable error. */
  | { kind: "transient"; count: number }
  /** Group operations fail; everything else succeeds. Leaves a half-done job. */
  | { kind: "partial-groups" }
  /** The write lands but the response is lost — the worker never hears back. */
  | { kind: "timeout-after-write" }
  /** The worker's account lacks rights. Never retryable. */
  | { kind: "permission" };

interface MockFile {
  accounts: AdAccountState[];
}

function resolvePath(): string {
  const configured = process.env.AD_MOCK_FILE?.trim() || "data/mock-ad.json";
  return path.isAbsolute(configured)
    ? configured
    : path.join(/* turbopackIgnore: true */ process.cwd(), configured);
}

async function load(): Promise<MockFile> {
  try {
    const raw = await readFile(resolvePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<MockFile>;
    return { accounts: parsed.accounts ?? [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { accounts: [] };
    throw error;
  }
}

async function persist(file: MockFile): Promise<void> {
  const target = resolvePath();
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  await rename(tmp, target);
}

/** Serialises access the way the other stores do. */
let queue: Promise<unknown> = Promise.resolve();

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function sortGroups(groups: readonly string[]): string[] {
  return [...new Set(groups.map((group) => group.trim()).filter(Boolean))].sort();
}

export class MockAdDriver implements AdDriver {
  readonly name = "mock";
  readonly simulated = true;

  private remainingTransient: number;

  constructor(private fault: FaultMode = { kind: "none" }) {
    this.remainingTransient = fault.kind === "transient" ? fault.count : 0;
  }

  /** Lets a demo or a test change the failure mode between runs. */
  setFault(fault: FaultMode): void {
    this.fault = fault;
    this.remainingTransient = fault.kind === "transient" ? fault.count : 0;
  }

  /**
   * Applies the configured fault, if any.
   *
   * `groupOperation` exists because "groups fail, everything else works" is the
   * shape that produces the case the plan cares most about: an account created
   * but never granted its access, which must be left disabled rather than
   * reported as done.
   */
  private failIfFaulty(groupOperation = false): void {
    if (this.fault.kind === "permission") {
      throw new AdError("PERMISSION", "Akun worker tidak memiliki hak untuk operasi ini.");
    }
    if (this.fault.kind === "transient" && this.remainingTransient > 0) {
      this.remainingTransient -= 1;
      throw new AdError("TRANSIENT", "Gangguan jaringan sementara ke domain controller.");
    }
    if (this.fault.kind === "partial-groups" && groupOperation) {
      throw new AdError("UNKNOWN", "Operasi group ditolak direktori.");
    }
  }

  /**
   * The write landed; the answer did not come back.
   *
   * Thrown AFTER the store has been updated, so the simulated directory really
   * does hold the change the worker never heard about. That is the only way to
   * rehearse a read-back reconciliation honestly.
   */
  private failAfterWrite(): void {
    if (this.fault.kind === "timeout-after-write") {
      throw new AdError("TIMEOUT_AFTER_WRITE", "Waktu tunggu habis setelah perubahan dikirim.");
    }
  }

  /*
   * Reads fault too, and that is not a detail.
   *
   * A directory refuses or drops a read as readily as a write — a revoked
   * binding, a domain controller that stopped answering — and a worker that
   * only handles write failures will crash on the first read that throws. These
   * used to succeed unconditionally, which quietly made a whole class of
   * failure untestable.
   */
  async findByAccountName(sAMAccountName: string): Promise<AdAccountState | undefined> {
    this.failIfFaulty();
    const { accounts } = await withLock(load);
    const needle = sAMAccountName.toLowerCase();
    return accounts.find((account) => account.sAMAccountName.toLowerCase() === needle);
  }

  async findByGuid(objectGUID: string): Promise<AdAccountState | undefined> {
    this.failIfFaulty();
    const { accounts } = await withLock(load);
    return accounts.find((account) => account.objectGUID === objectGUID);
  }

  async createAccount(spec: AdCreateSpec): Promise<AdAccountState> {
    this.failIfFaulty();

    return withLock(async () => {
      const file = await load();
      const needle = spec.sAMAccountName.toLowerCase();

      if (file.accounts.some((account) => account.sAMAccountName.toLowerCase() === needle)) {
        // Not a transient problem and not something to retry around: a second
        // account for the same person is the failure this guards against.
        throw new AdError("CONFLICT", `Akun ${spec.sAMAccountName} sudah ada di direktori.`);
      }

      const created: AdAccountState = {
        objectGUID: randomUUID(),
        sAMAccountName: spec.sAMAccountName,
        userPrincipalName: spec.userPrincipalName,
        displayName: spec.displayName,
        mail: spec.mail,
        department: spec.department,
        title: spec.title,
        manager: spec.manager,
        // Always disabled on creation. See AdDriver.createAccount.
        enabled: false,
        ou: spec.ou,
        groups: [],
      };

      file.accounts.push(created);
      await persist(file);
      this.failAfterWrite();
      return created;
    });
  }

  private async mutate(
    objectGUID: string,
    change: (account: AdAccountState) => void,
  ): Promise<void> {
    await withLock(async () => {
      const file = await load();
      const account = file.accounts.find((candidate) => candidate.objectGUID === objectGUID);
      if (!account) {
        throw new AdError("NOT_FOUND", `Objek ${objectGUID} tidak ditemukan di direktori.`);
      }
      change(account);
      await persist(file);
    });
    this.failAfterWrite();
  }

  async setAttributes(objectGUID: string, patch: AdAttributePatch): Promise<void> {
    this.failIfFaulty();
    await this.mutate(objectGUID, (account) => {
      if (patch.displayName !== undefined) account.displayName = patch.displayName;
      if (patch.department !== undefined) account.department = patch.department;
      if (patch.title !== undefined) account.title = patch.title;
      if (patch.manager !== undefined) account.manager = patch.manager;
      if (patch.mail !== undefined) account.mail = patch.mail;
    });
  }

  async addGroups(objectGUID: string, groups: readonly string[]): Promise<void> {
    this.failIfFaulty(true);
    await this.mutate(objectGUID, (account) => {
      // Adding a group somebody already holds is not an error — a retry must be
      // able to re-run this step without tripping over its own earlier success.
      account.groups = sortGroups([...account.groups, ...groups]);
    });
  }

  async removeGroups(objectGUID: string, groups: readonly string[]): Promise<void> {
    this.failIfFaulty(true);
    const remove = new Set(groups.map((group) => group.toLowerCase()));
    await this.mutate(objectGUID, (account) => {
      account.groups = account.groups.filter((group) => !remove.has(group.toLowerCase()));
    });
  }

  async moveToOu(objectGUID: string, ou: string): Promise<void> {
    this.failIfFaulty();
    await this.mutate(objectGUID, (account) => {
      account.ou = ou;
    });
  }

  async enableAccount(objectGUID: string): Promise<void> {
    this.failIfFaulty();
    await this.mutate(objectGUID, (account) => {
      account.enabled = true;
    });
  }

  async disableAccount(objectGUID: string): Promise<void> {
    this.failIfFaulty();
    await this.mutate(objectGUID, (account) => {
      account.enabled = false;
    });
  }
}

/** Seeds the simulated directory. For demos and tests, never for production. */
export async function seedMockDirectory(accounts: AdAccountState[]): Promise<void> {
  await withLock(async () => {
    await persist({ accounts });
  });
}

export async function readMockDirectory(): Promise<AdAccountState[]> {
  const { accounts } = await withLock(load);
  return accounts;
}
