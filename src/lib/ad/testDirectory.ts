import {
  ACCESS_PROFILES,
  accessProfileGroups,
  accessProfileOu,
  quarantineOu,
} from "@/lib/lifecycle/accessProfiles";

import { FakeLdapDirectory, FakeLdapError, RESULT } from "./fakeLdapDirectory";
import { setAdDriverForTests } from "./index";
import { LdapAdDriver } from "./ldapAd";
import type { LdapAdConfig, LdapClientLike } from "./ldapConnection";
import { containerOf, escapeDnValue, isManaged, normaliseDn } from "./ldapDn";
import type { AdAccountState } from "./types";

/**
 * A directory for tests that run the worker, the planner or the CISO routing
 * end to end.
 *
 * TEST SUPPORT ONLY. Nothing in the application imports this file.
 *
 * It is the real LdapAdDriver over FakeLdapDirectory, laid out the way the
 * access catalogue's development defaults expect: the OU each profile places
 * an account in, the quarantine OU, and the catalogue groups. A test of the
 * worker therefore exercises the driver production runs - the DN it builds,
 * the GUID it decodes, the way it classifies a failure - instead of a stand-in
 * that hands back ready-made answers. That stand-in, the simulated directory,
 * has been removed from the application.
 */

const BASE_DN = "DC=corp,DC=example,DC=com";

/**
 * Where the people a request names as manager live.
 *
 * Outside the managed OUs on purpose: the driver only ever reads a manager,
 * and accounts() lists what the worker created or changed, not them.
 */
const PEOPLE_OU = `OU=Pimpinan,${BASE_DN}`;

/**
 * How the directory misbehaves, from the next operation on.
 *
 * Injected at the LDAP client, below the driver, so what the worker sees is the
 * driver's own classification of a coded LDAP failure - the same path a real
 * domain controller's refusal takes.
 */
export type DirectoryFault =
  | "none"
  /** Every operation, reads included, is refused: insufficientAccessRights. */
  | "permission"
  /** Changing a group's membership is refused; everything else works. */
  | "partial-groups";

export interface TestAccount {
  sAMAccountName: string;
  displayName: string;
  mail: string;
  ou: string;
  department?: string;
  title?: string;
  /** sAMAccountName of somebody added with addManager. */
  manager?: string;
  enabled?: boolean;
  groups?: readonly string[];
  /** Canonical and lower-case, as the driver reports it. Generated when absent. */
  objectGUID?: string;
}

export interface TestDirectory {
  readonly directory: FakeLdapDirectory;
  readonly driver: LdapAdDriver;
  /** Changes how the directory fails, from the next operation on. */
  fail(fault: DirectoryFault): void;
  /** Somebody a request can name as manager. */
  addManager(sAMAccountName: string, displayName: string): void;
  /** An account put there directly, as an administrator would. Returns its GUID. */
  addAccount(account: TestAccount): string;
  /** Every account inside the managed OUs, read past any fault. */
  accounts(): Promise<AdAccountState[]>;
}

/** Every OU the catalogue's defaults can place an account in, plus quarantine. */
function catalogueOus(): string[] {
  const ous = [...ACCESS_PROFILES.map((profile) => accessProfileOu(profile.id)), quarantineOu()];
  return [...new Map(ous.map((ou) => [normaliseDn(ou), ou])).values()];
}

/** The DN and every parent below the base, outermost first. */
function withParents(dn: string): string[] {
  const chain: string[] = [];
  for (let current = dn; normaliseDn(current) !== normaliseDn(BASE_DN); current = containerOf(current)) {
    chain.unshift(current);
  }
  return chain;
}

export function createTestDirectory(): TestDirectory {
  const directory = new FakeLdapDirectory();
  const managedOus = catalogueOus();
  const groups = accessProfileGroups.all();

  const containers = [...managedOus, PEOPLE_OU, ...groups.map(containerOf)].flatMap(withParents);
  for (const ou of new Map(containers.map((dn) => [normaliseDn(dn), dn])).values()) {
    directory.addOu(ou);
  }
  for (const group of groups) directory.addGroup(group);

  const config: LdapAdConfig = {
    url: "ldaps://dc.corp.example.com",
    baseDn: BASE_DN,
    bindDn: `CN=svc-hc,OU=Service,${BASE_DN}`,
    bindPassword: "unused-by-the-fake",
    caCertPath: "unused-by-the-fake",
    managedOus,
    writeEnabled: true,
    nestedGroups: false,
    timeoutMs: 1000,
    pageSize: 50,
  };

  let fault: DirectoryFault = "none";

  function refuseIfDenied(): void {
    if (fault === "permission") {
      throw new FakeLdapError(
        RESULT.insufficientAccessRights,
        "Akun layanan tidak memiliki hak untuk operasi ini.",
      );
    }
  }

  function isGroup(dn: string): boolean {
    return directory.entry(dn)?.attributes.objectclass?.includes("group") ?? false;
  }

  function faulty(client: LdapClientLike): LdapClientLike {
    return {
      search: async (baseDn, options) => {
        refuseIfDenied();
        return client.search(baseDn, options);
      },
      add: async (dn, entry) => {
        refuseIfDenied();
        return client.add(dn, entry);
      },
      modify: async (dn, changes) => {
        refuseIfDenied();
        if (fault === "partial-groups" && isGroup(dn)) {
          throw new FakeLdapError(RESULT.other, "Operasi group ditolak direktori.");
        }
        return client.modify(dn, changes);
      },
      modifyDn: async (dn, newDn) => {
        refuseIfDenied();
        return client.modifyDn(dn, newDn);
      },
      close: () => client.close(),
    };
  }

  const driver = new LdapAdDriver(config, async () => faulty(directory.client()));
  // Reads for assertions go around the fault: a test that switched the
  // directory off still needs to see what is in it.
  const reader = new LdapAdDriver(config, async () => directory.client());
  const managerDns = new Map<string, string>();

  return {
    directory,
    driver,

    fail(next) {
      fault = next;
    },

    addManager(sAMAccountName, displayName) {
      const dn = `CN=${escapeDnValue(displayName)},${PEOPLE_OU}`;
      directory.addUser({
        dn,
        sAMAccountName,
        displayName,
        mail: `${sAMAccountName}@example.com`,
      });
      managerDns.set(sAMAccountName, dn);
    },

    addAccount(account) {
      const managerDn = account.manager ? managerDns.get(account.manager) : undefined;
      if (account.manager && !managerDn) {
        throw new Error(`Manager ${account.manager} belum ada; panggil addManager lebih dulu.`);
      }

      const dn = `CN=${escapeDnValue(account.displayName)},${account.ou}`;
      const guid = directory.addUser({
        dn,
        sAMAccountName: account.sAMAccountName,
        displayName: account.displayName,
        mail: account.mail,
        department: account.department,
        title: account.title,
        managerDn,
        userAccountControl: account.enabled === false ? 0x202 : 0x200,
        objectGUID: account.objectGUID,
      });
      for (const group of account.groups ?? []) directory.addMember(group, dn);
      return guid;
    },

    async accounts() {
      const client = directory.client();
      try {
        const found = await client.search(BASE_DN, {
          scope: "sub",
          filter: "(&(objectClass=user)(objectCategory=person))",
          attributes: ["sAMAccountName"],
        });
        const names = found
          .filter((entry) => isManaged(entry.dn, managedOus))
          .map((entry) => String([entry.sAMAccountName].flat()[0]));

        const accounts: AdAccountState[] = [];
        for (const name of names) {
          const account = await reader.findByAccountName(name);
          if (account) accounts.push(account);
        }
        return accounts;
      } finally {
        await client.close();
      }
    },
  };
}

/** createTestDirectory, installed as the driver getAdDriver() returns. */
export function installTestDirectory(): TestDirectory {
  const test = createTestDirectory();
  setAdDriverForTests(test.driver);
  return test;
}
