import { accessProfileGroups, accessProfileOu, quarantineOu } from "@/lib/lifecycle/accessProfiles";

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
    attributes: { department?: string; title?: string; manager?: string };
  };
}

/** The account name the directory will know this person by. */
export function accountNameFor(email: string): string {
  return email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

export function buildPlan(
  payload: LifecyclePayload,
  before?: { groups: string[]; managerAccount?: string },
): ExecutionPlan {
  if (payload.kind === "ONBOARDING") {
    const groups = accessProfileGroups(payload.accessProfileId);
    const ou = accessProfileOu(payload.accessProfileId);

    return {
      steps: [
        {
          key: "create-account",
          label: "Membuat objek akun dalam keadaan nonaktif",
          params: {
            sAMAccountName: accountNameFor(payload.email),
            displayName: payload.displayName,
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
