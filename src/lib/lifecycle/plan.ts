import { dnEquals } from "@/lib/ad/ldapDn";
import {
  accessProfileGroups,
  accessProfileOu,
  departmentOu,
  quarantineOu,
} from "@/lib/lifecycle/accessProfiles";

import type { LifecyclePayload } from "./types";

/**
 * Turning an approved request into an ordered list of directory operations.
 *
 * The order is not an implementation detail. Each sequence below is chosen so
 * that an interruption at ANY point leaves the account in a safe state rather
 * than a permissive one:
 *
 *   Onboarding  create disabled → attributes → groups → verify → enable
 *     Stopping anywhere before the last step leaves an account that exists but
 *     cannot be used. Creating it enabled and adding groups afterwards would
 *     invert that: a usable account, briefly, that nobody had finished
 *     authorising.
 *
 *   Termination disable → revoke groups → move to quarantine → verify
 *     Disabling comes first for the mirror-image reason. If the job dies after
 *     step one, access is already gone; the tidying up can be finished later.
 *     Revoking groups first would leave a working account with fewer
 *     permissions, which is not what was asked for.
 *
 *   Movement    verify unchanged → attributes → revoke old → grant new → verify
 *     Revoke before grant, so the person is never briefly holding both sets of
 *     access at once. The cost is a gap where they hold neither, which the CISO
 *     accepts per profile — the plan is explicit that this ordering is theirs
 *     to decide, and this is the conservative default.
 *
 * Step keys are deterministic and stable, because a retry uses them to work out
 * what has already been done. Generating them from an index would renumber
 * everything the moment a step is inserted.
 */

export type StepKey =
  | "create-account"
  | "set-attributes"
  | "revoke-groups"
  | "grant-groups"
  | "move-ou"
  | "enable-account"
  | "disable-account"
  | "verify";

export interface PlannedStep {
  key: StepKey;
  /** One line, in the language of the UI, for the execution timeline. */
  label: string;
  /** Typed parameters. Never a command, never a script path. */
  params: Record<string, string | string[] | undefined>;
}

export interface ExecutionPlan {
  steps: PlannedStep[];
  /** What must be true afterwards for the job to count as done. */
  postconditions: {
    enabled: boolean;
    ou: string;
    /** Groups the account must hold. */
    requiredGroups: string[];
    /** Groups it must NOT hold. */
    forbiddenGroups: string[];
    attributes: { displayName?: string; department?: string; title?: string; manager?: string };
  };
}

/** What the directory said about the object before anything ran. */
export interface PlanBefore {
  groups: string[];
  enabled?: boolean;
  ou?: string;
}

/** The account name the directory will know this person by. */
export function accountNameFor(email: string): string {
  return email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

export function buildPlan(payload: LifecyclePayload, before?: PlanBefore): ExecutionPlan {
  if (payload.kind === "PROFILE_UPDATE") {
    /*
     * Only the attributes the directory actually holds are written: name,
     * department, title. Employment type, location, the HC note and the rest
     * live in the portal's record alone and are applied from the verified result.
     *
     * The postconditions pin everything else to how it was found — same enabled
     * state, same OU, no group touched. A profile edit that quietly re-enabled a
     * disabled account or moved it out of quarantine is exactly the side effect
     * the read-back is there to catch.
     */
    const attributes = {
      displayName: payload.profile.displayName,
      department: payload.profile.department,
      title: payload.profile.jobTitle,
    };

    return {
      steps: [
        {
          key: "set-attributes",
          label: "Memperbarui nama, departemen, dan jabatan",
          params: attributes,
        },
        { key: "verify", label: "Membaca ulang hasil dari direktori", params: {} },
      ],
      postconditions: {
        enabled: before?.enabled ?? true,
        ou: before?.ou ?? accessProfileOu("standard"),
        requiredGroups: [...(before?.groups ?? [])],
        forbiddenGroups: [],
        attributes,
      },
    };
  }

  if (payload.kind === "ONBOARDING") {
    /*
     * A new account with no profile named gets the standard one. It has to go
     * somewhere and hold something: an object in no OU with no group is not an
     * account anybody can use, and refusing to create it would turn a form HC
     * no longer fills into a request that cannot be executed.
     */
    const profile = payload.accessProfileId ?? "standard";
    const groups = accessProfileGroups(profile);
    /*
     * The division decides the OU. A request that names a profile - one raised
     * before HC stopped choosing them - keeps that profile's OU, because that
     * is what was approved. A division with no OU of its own lands in the
     * standard one.
     */
    const ou = payload.accessProfileId
      ? accessProfileOu(payload.accessProfileId)
      : (departmentOu(payload.department) ?? accessProfileOu("standard"));

    return {
      steps: [
        {
          key: "create-account",
          label: "Membuat objek akun dalam keadaan nonaktif",
          params: {
            // The login HC typed, or the address it used to be derived from
            // for a request raised before that field existed.
            sAMAccountName: payload.userId ?? accountNameFor(payload.email),
            displayName: payload.displayName,
            givenName: payload.firstName,
            sn: payload.lastName,
            mail: payload.email,
            ou,
          },
        },
        {
          key: "set-attributes",
          label: "Mengisi atribut identitas dan manager",
          params: {
            department: payload.department,
            title: payload.jobTitle,
            manager: accountNameFor(payload.managerEmail),
          },
        },
        {
          key: "grant-groups",
          label: "Menambahkan keanggotaan group sesuai profil akses",
          params: { groups },
        },
        { key: "verify", label: "Membaca ulang hasil dari direktori", params: {} },
        {
          key: "enable-account",
          label: "Mengaktifkan akun setelah seluruh langkah wajib selesai",
          params: {},
        },
      ],
      postconditions: {
        enabled: true,
        ou,
        requiredGroups: groups,
        forbiddenGroups: [],
        attributes: {
          department: payload.department,
          title: payload.jobTitle,
          manager: accountNameFor(payload.managerEmail),
        },
      },
    };
  }

  if (payload.kind === "MOVEMENT") {
    /*
     * A move with no profile named does not touch access — no groups granted,
     * none revoked. The attributes move, and the account follows its new
     * division into that division's OU when the division has one of its own
     * and it is not where the account already is. A division with no OU of
     * its own leaves the account where it is: moving it to the standard OU
     * because a mapping is missing would be a change nobody asked for.
     *
     * Groups stay deliberately quiet: a move that silently stripped the groups
     * a person holds would be a partial termination wearing a move's name.
     */
    if (!payload.accessProfileId) {
      const attributes = {
        department: payload.toDepartment,
        title: payload.toJobTitle,
        manager: accountNameFor(payload.toManagerEmail),
      };
      const divisionOu = departmentOu(payload.toDepartment);
      const moveTo =
        divisionOu && !(before?.ou && dnEquals(before.ou, divisionOu)) ? divisionOu : undefined;
      return {
        steps: [
          {
            key: "set-attributes",
            label: "Memperbarui divisi, jabatan, dan manager",
            params: attributes,
          },
          ...(moveTo
            ? [{ key: "move-ou" as const, label: "Memindahkan objek ke OU divisi baru", params: { ou: moveTo } }]
            : []),
          { key: "verify", label: "Membaca ulang hasil dari direktori", params: {} },
        ],
        postconditions: {
          /*
           * Access is pinned to how the account was found rather than left
           * unchecked: the read-back still has to say every group the person
           * held is still held, and that the OU is the one intended - the
           * division's, or the one it was in. A move that quietly moved
           * somebody anywhere else is what this catches.
           */
          enabled: before?.enabled ?? true,
          ou: moveTo ?? before?.ou ?? accessProfileOu("standard"),
          requiredGroups: [...(before?.groups ?? [])],
          forbiddenGroups: [],
          attributes,
        },
      };
    }

    const nextGroups = accessProfileGroups(payload.accessProfileId);
    const ou = accessProfileOu(payload.accessProfileId);
    /*
     * Only groups this application manages are revoked. A membership added by
     * hand, a primary group, or anything privileged is left alone — wiping
     * every group a person holds because a move was approved is how a move
     * quietly becomes a partial termination.
     */
    const managed = new Set(accessProfileGroups.all());
    const toRevoke = (before?.groups ?? [])
      .filter((group) => managed.has(group))
      .filter((group) => !nextGroups.includes(group));

    return {
      steps: [
        {
          key: "set-attributes",
          label: "Memperbarui divisi, jabatan, dan manager",
          params: {
            department: payload.toDepartment,
            title: payload.toJobTitle,
            manager: accountNameFor(payload.toManagerEmail),
          },
        },
        {
          key: "revoke-groups",
          label: "Mencabut akses lama yang tidak lagi berlaku",
          params: { groups: toRevoke },
        },
        {
          key: "grant-groups",
          label: "Menambahkan akses sesuai profil baru",
          params: { groups: nextGroups },
        },
        { key: "move-ou", label: "Memindahkan objek ke OU tujuan", params: { ou } },
        { key: "verify", label: "Membaca ulang hasil dari direktori", params: {} },
      ],
      postconditions: {
        enabled: true,
        ou,
        requiredGroups: nextGroups,
        forbiddenGroups: toRevoke,
        attributes: {
          department: payload.toDepartment,
          title: payload.toJobTitle,
          manager: accountNameFor(payload.toManagerEmail),
        },
      },
    };
  }

  const ou = quarantineOu();
  const toRevoke = (before?.groups ?? []).filter((group) => accessProfileGroups.all().includes(group));

  return {
    steps: [
      {
        key: "disable-account",
        label: "Menonaktifkan akun — tindakan pertama",
        params: {},
      },
      {
        key: "revoke-groups",
        label: "Mencabut keanggotaan group dalam lingkup kebijakan",
        params: { groups: toRevoke },
      },
      { key: "move-ou", label: "Memindahkan objek ke OU karantina", params: { ou } },
      { key: "verify", label: "Membaca ulang hasil dari direktori", params: {} },
    ],
    postconditions: {
      enabled: false,
      ou,
      requiredGroups: [],
      forbiddenGroups: toRevoke,
      attributes: {},
    },
  };
}
