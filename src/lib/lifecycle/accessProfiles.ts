/**
 * The access profiles available to the worker.
 *
 * HC chooses a profile, never an OU, a group name, or a distinguished name.
 * That is the whole point of having a catalogue: the form offers a decision a
 * human can reason about ("Engineering — standard"), and the mapping from that
 * decision to directory objects is made once, reviewed, and kept out of reach
 * of whoever is filling in the form.
 *
 * Labels are application data; OUs and group DNs belong to the customer's
 * directory and are supplied by environment variables on the server.
 */

import { AdConfigurationError } from "@/lib/ad/configError";
import { escapeDnValue } from "@/lib/ad/ldapDn";

export interface AccessProfile {
  id: string;
  label: string;
  description: string;
}

export const ACCESS_PROFILES: readonly AccessProfile[] = [
  {
    id: "standard",
    label: "Standar karyawan",
    description: "Akses dasar: email, direktori, dan aplikasi umum perusahaan.",
  },
  {
    id: "engineering",
    label: "Engineering",
    description: "Akses standar ditambah repository kode dan lingkungan pengembangan.",
  },
  {
    id: "finance",
    label: "Finance",
    description: "Akses standar ditambah aplikasi keuangan dan pelaporan.",
  },
  {
    id: "security",
    label: "IT Security",
    description: "Akses standar ditambah perkakas keamanan dan pemantauan.",
  },
  {
    id: "none",
    label: "Tanpa akses aplikasi",
    description: "Hanya akun direktori. Dipakai saat akses aplikasi diajukan terpisah.",
  },
] as const;

const PROFILE_DIRECTORY_CONFIG = {
  standard: {
    groups: [["AD_ACCESS_GROUP_BASE", "CN=HC-Base,OU=Groups,DC=corp,DC=example,DC=com"]],
    ou: ["AD_OU_STANDARD", "OU=Karyawan,DC=corp,DC=example,DC=com"],
  },
  engineering: {
    groups: [
      ["AD_ACCESS_GROUP_BASE", "CN=HC-Base,OU=Groups,DC=corp,DC=example,DC=com"],
      ["AD_ACCESS_GROUP_ENGINEERING", "CN=HC-Engineering,OU=Groups,DC=corp,DC=example,DC=com"],
    ],
    ou: ["AD_OU_ENGINEERING", "OU=Engineering,OU=Karyawan,DC=corp,DC=example,DC=com"],
  },
  finance: {
    groups: [
      ["AD_ACCESS_GROUP_BASE", "CN=HC-Base,OU=Groups,DC=corp,DC=example,DC=com"],
      ["AD_ACCESS_GROUP_FINANCE", "CN=HC-Finance,OU=Groups,DC=corp,DC=example,DC=com"],
    ],
    ou: ["AD_OU_FINANCE", "OU=Finance,OU=Karyawan,DC=corp,DC=example,DC=com"],
  },
  security: {
    groups: [
      ["AD_ACCESS_GROUP_BASE", "CN=HC-Base,OU=Groups,DC=corp,DC=example,DC=com"],
      ["AD_ACCESS_GROUP_SECURITY", "CN=HC-Security,OU=Groups,DC=corp,DC=example,DC=com"],
    ],
    ou: ["AD_OU_SECURITY", "OU=Security,OU=Karyawan,DC=corp,DC=example,DC=com"],
  },
  none: {
    groups: [],
    ou: ["AD_OU_STANDARD", "OU=Karyawan,DC=corp,DC=example,DC=com"],
  },
} as const;

type ConfigPair = readonly [environment: string, developmentDefault: string];

function configuredDn([environment, developmentDefault]: ConfigPair): string {
  const configured = process.env[environment]?.trim();
  if (configured) return configured;
  if (
    process.env.NODE_ENV === "production" ||
    process.env.AD_DRIVER?.trim().toLowerCase() === "ldap"
  ) {
    throw new AdConfigurationError(`${environment} wajib diisi saat driver Active Directory nyata digunakan.`);
  }
  return developmentDefault;
}

function profileConfig(id: string) {
  return PROFILE_DIRECTORY_CONFIG[id as keyof typeof PROFILE_DIRECTORY_CONFIG];
}

/**
 * The groups a profile grants.
 *
 * `.all()` hangs off the same function on purpose: every caller that needs "is
 * this group one of ours?" gets it from the same catalogue that decides what a
 * profile grants, so the two can never drift apart. That question matters —
 * it is what stops a movement stripping a group this application never issued.
 */
export const accessProfileGroups = Object.assign(
  (id: string): string[] => profileConfig(id)?.groups.map(configuredDn) ?? [],
  {
    all: (): string[] =>
      [...new Set(ACCESS_PROFILES.flatMap((profile) => accessProfileGroups(profile.id)))],
  },
);

export function accessProfileOu(id: string): string {
  return configuredDn(profileConfig(id)?.ou ?? PROFILE_DIRECTORY_CONFIG.standard.ou);
}

/**
 * Where terminated accounts go.
 *
 * A separate OU rather than deletion: the object is retained so the history it
 * carries survives, and permanent removal is a different process with its own
 * approval. The plan is explicit that deletion is never the default here.
 */
export function quarantineOu(): string {
  const configured = process.env.AD_QUARANTINE_OU?.trim();
  if (configured) return configured;
  if (
    process.env.NODE_ENV === "production" ||
    process.env.AD_DRIVER?.trim().toLowerCase() === "ldap"
  ) {
    throw new AdConfigurationError("AD_QUARANTINE_OU wajib diisi saat driver Active Directory nyata digunakan.");
  }
  return "OU=Karantina,DC=corp,DC=example,DC=com";
}

/* -------------------------------------------------------------------------- */
/* The OU a division's accounts live in                                       */
/* -------------------------------------------------------------------------- */

/**
 * One division's OU, as configured.
 *
 * HC picks the division on the form; the OU follows from it, so nobody filling
 * in a request ever types or chooses a distinguished name. Two ways to say
 * where each division lives, usable together:
 *
 *   AD_DEPARTMENT_OUS        explicit pairs, `Division=>OU DN`, separated by
 *                            `;` - the same separator AD_MANAGED_OUS uses,
 *                            and a character a DN does not contain unescaped.
 *   AD_DEPARTMENT_OU_PARENT  a convention for every division not listed: the
 *                            OU named after the division, under this parent.
 *
 * A division neither one covers has no OU of its own; the caller decides what
 * that means (a new account goes to AD_OU_STANDARD, a move stays put).
 */
export interface DepartmentOu {
  department: string;
  ou: string;
}

type DepartmentEnv = Record<string, string | undefined>;

function departmentPairs(env: DepartmentEnv): DepartmentOu[] {
  const raw = env.AD_DEPARTMENT_OUS?.trim();
  if (!raw) return [];

  return raw
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const arrow = entry.indexOf("=>");
      const department = arrow < 0 ? "" : entry.slice(0, arrow).trim();
      const ou = arrow < 0 ? "" : entry.slice(arrow + 2).trim();
      if (!department || !ou) {
        throw new AdConfigurationError(
          `AD_DEPARTMENT_OUS: "${entry}" bukan bentuk Divisi=>DN OU. Pisahkan tiap divisi dengan ;`,
        );
      }
      return { department, ou };
    });
}

/** Every explicitly mapped division, for the status page. */
export function configuredDepartmentOus(env: DepartmentEnv = process.env): DepartmentOu[] {
  return departmentPairs(env);
}

/** The parent OU of the naming convention, when one is set. */
export function departmentOuParent(env: DepartmentEnv = process.env): string | undefined {
  return env.AD_DEPARTMENT_OU_PARENT?.trim() || undefined;
}

/**
 * The OU for a division: the explicit pair first, then the convention.
 *
 * Division names are matched ignoring case and surrounding space, because the
 * form and the configuration are typed by different people.
 */
export function departmentOu(
  department: string | undefined,
  env: DepartmentEnv = process.env,
): string | undefined {
  const name = department?.trim();
  if (!name) return undefined;

  const explicit = departmentPairs(env).find(
    (pair) => pair.department.toLowerCase() === name.toLowerCase(),
  );
  if (explicit) return explicit.ou;

  const parent = departmentOuParent(env);
  return parent ? `OU=${escapeDnValue(name)},${parent}` : undefined;
}

export function isAccessProfileId(value: unknown): boolean {
  return typeof value === "string" && ACCESS_PROFILES.some((profile) => profile.id === value);
}

export function accessProfileLabel(id: string): string {
  return ACCESS_PROFILES.find((profile) => profile.id === id)?.label ?? id;
}
