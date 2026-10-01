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

export function isAccessProfileId(value: unknown): boolean {
  return typeof value === "string" && ACCESS_PROFILES.some((profile) => profile.id === value);
}

export function accessProfileLabel(id: string): string {
  return ACCESS_PROFILES.find((profile) => profile.id === id)?.label ?? id;
}
