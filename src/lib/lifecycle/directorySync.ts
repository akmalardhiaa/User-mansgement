import { randomUUID } from "node:crypto";

import { getAdDriver } from "@/lib/ad";
import type { AdAccountState, AdDriver } from "@/lib/ad/types";
import { recordActivityInDraft } from "@/lib/db/repository";
import { mutateStore } from "@/lib/db/store";
import type { Employee } from "@/lib/types";

/**
 * The portal's employee directory, kept in step with Active Directory.
 *
 * Once a directory is connected, the people in it appear in the portal on
 * their own: nobody types an existing employee in, and nobody has to, because
 * a manager can only be chosen from this directory and a movement or a
 * termination can only be raised against somebody in it.
 *
 * A read of the directory and a write of the portal's own store - never the
 * other way round. What it will and will not do:
 *
 *   - An account is matched to a record by objectGUID, or - for a record that
 *     predates any link - by e-mail address, and then linked.
 *   - The fields the directory holds are copied from it: name, address,
 *     division, job title, manager, enabled. A value the directory leaves
 *     empty never blanks one the portal has.
 *   - Fields only the portal holds - employment type, location, contract end
 *     - are never touched.
 *   - A new record is made only for an ENABLED account with a mailbox. A
 *     disabled account the portal never knew is a former employee, and an
 *     account with no mailbox is a service or resource account, not a person.
 *   - A record whose object the read did not return is left exactly as it is,
 *     and counted. Disabling or removing people because one read came back
 *     short - a mistyped AD_SYNC_OUS, a DC that answered from a partial
 *     replica - would empty the directory on a configuration error.
 */

export interface DirectorySyncReport {
  at: string;
  /** The containers read. */
  sources: string[];
  /** Accounts the directory returned. */
  read: number;
  created: number;
  updated: number;
  /** Existing records matched by address and linked to their object. */
  linked: number;
  /** Accounts with no mailbox: service and resource accounts, not people. */
  skipped: number;
  /** Disabled accounts the portal never knew: former staff, left out. */
  ignoredDisabled: number;
  /** An address already held by a record linked to a different object. */
  conflicts: number;
  /** Linked records whose object this read did not return. Left alone. */
  notFound: number;
}

type SyncEnv = Record<string, string | undefined>;

/**
 * Where to read people from: AD_SYNC_OUS when set, the base DN otherwise.
 *
 * The base DN by default, deliberately wider than AD_MANAGED_OUS: managers
 * often sit outside the OUs this portal may write to - a board in its own OU,
 * say - and a manager the portal cannot see is a manager nobody can choose.
 */
export function directorySyncSources(env: SyncEnv = process.env): string[] {
  const explicit = (env.AD_SYNC_OUS ?? "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (explicit.length > 0) return explicit;
  const base = env.AD_BASE_DN?.trim() || env.LDAP_BASE_DN?.trim();
  return base ? [base] : [];
}

function lower(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** The directory-held fields of a record, as the directory states them. */
function fieldsFrom(
  account: AdAccountState,
  manager: AdAccountState | undefined,
): Pick<
  Employee,
  "firstName" | "lastName" | "displayName" | "email" | "jobTitle" | "department" | "managerName" | "managerEmail" | "status"
> {
  const displayName =
    account.displayName.trim() ||
    [account.givenName, account.sn].filter(Boolean).join(" ").trim() ||
    account.sAMAccountName;
  const [first, ...rest] = displayName.split(/\s+/);
  return {
    firstName: account.givenName?.trim() || first,
    lastName: account.sn?.trim() || rest.join(" "),
    displayName,
    email: lower(account.mail),
    jobTitle: account.title.trim(),
    department: account.department.trim(),
    managerName: manager?.displayName.trim() ?? "",
    managerEmail: lower(manager?.mail),
    status: account.enabled ? "ACTIVE" : "DISABLED",
  };
}

/**
 * Copies onto a record what the directory holds, and says whether anything
 * changed. An empty directory value leaves the record's value alone.
 */
function applyFields(employee: Employee, fields: ReturnType<typeof fieldsFrom>): boolean {
  let changed = false;
  for (const [key, value] of Object.entries(fields) as Array<[keyof typeof fields, string]>) {
    if (value === "") continue;
    const current = employee[key] as string | undefined;
    const same = key === "email" || key === "managerEmail" ? lower(current) === value : current === value;
    if (!same) {
      (employee as unknown as Record<string, string>)[key] = value;
      changed = true;
    }
  }
  return changed;
}

function describe(report: DirectorySyncReport): string {
  return `${report.created} karyawan baru, ${report.updated} diperbarui, ${report.linked} ditautkan`;
}

export async function syncEmployeesFromDirectory(
  options: { driver?: AdDriver; env?: SyncEnv; now?: () => Date } = {},
): Promise<DirectorySyncReport> {
  const driver = options.driver ?? getAdDriver();
  const sources = directorySyncSources(options.env);
  const at = (options.now ?? (() => new Date()))().toISOString();

  // Read everything before taking the store's lock: the directory may be
  // slow, and nothing else should wait on it.
  const byGuid = new Map<string, AdAccountState>();
  for (const source of sources) {
    for (const account of await driver.listAccounts(source)) byGuid.set(lower(account.objectGUID), account);
  }
  const accounts = [...byGuid.values()];

  // Managers by account name: from this read first, then from the directory
  // for anybody outside the sources - each asked for once.
  const byName = new Map<string, AdAccountState | null>(
    accounts.map((account) => [lower(account.sAMAccountName), account]),
  );
  const managerOf = new Map<string, AdAccountState | undefined>();
  for (const account of accounts) {
    if (!account.manager) continue;
    const key = lower(account.manager);
    if (!byName.has(key)) {
      byName.set(key, (await driver.findByAccountName(account.manager).catch(() => undefined)) ?? null);
    }
    managerOf.set(lower(account.objectGUID), byName.get(key) ?? undefined);
  }

  return mutateStore((draft) => {
    const report: DirectorySyncReport = {
      at,
      sources,
      read: accounts.length,
      created: 0,
      updated: 0,
      linked: 0,
      skipped: 0,
      ignoredDisabled: 0,
      conflicts: 0,
      notFound: 0,
    };

    for (const account of accounts) {
      const guid = lower(account.objectGUID);
      const email = lower(account.mail);
      if (!email) {
        report.skipped += 1;
        continue;
      }
      const fields = fieldsFrom(account, managerOf.get(guid));

      let employee = draft.employees.find((candidate) => lower(candidate.objectGUID) === guid);
      if (!employee) {
        const sameAddress = draft.employees.filter((candidate) => lower(candidate.email) === email);
        if (sameAddress.length > 1 || sameAddress[0]?.objectGUID) {
          // Linked to another object, or ambiguous: guessing would merge two
          // people into one record.
          report.conflicts += 1;
          continue;
        }
        employee = sameAddress[0];
        if (employee) {
          employee.objectGUID = account.objectGUID;
          employee.updatedAt = at;
          report.linked += 1;
        }
      }

      if (!employee) {
        if (!account.enabled) {
          report.ignoredDisabled += 1;
          continue;
        }
        draft.employees.push({
          id: `emp_${randomUUID()}`,
          ...fields,
          objectGUID: account.objectGUID,
          createdAt: at,
          updatedAt: at,
        });
        report.created += 1;
        continue;
      }

      if (applyFields(employee, fields)) {
        employee.updatedAt = at;
        report.updated += 1;
      }
    }

    report.notFound = draft.employees.filter(
      (candidate) => candidate.objectGUID && !byGuid.has(lower(candidate.objectGUID)),
    ).length;

    if (report.created + report.updated + report.linked > 0) {
      recordActivityInDraft(draft, {
        actor: "Sinkronisasi AD",
        action: "directory.synced",
        detail: `Dari Active Directory: ${describe(report)}.`,
      });
    }

    return report;
  });
}

export { describe as describeDirectorySync };
