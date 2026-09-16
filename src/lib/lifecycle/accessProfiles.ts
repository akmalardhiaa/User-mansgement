/**
 * The access profiles HC may pick from.
 *
 * HC chooses a profile, never an OU, a group name, or a distinguished name.
 * That is the whole point of having a catalogue: the form offers a decision a
 * human can reason about ("Engineering — standard"), and the mapping from that
 * decision to directory objects is made once, reviewed, and kept out of reach
 * of whoever is filling in the form.
 *
 * The AD groups and OU each profile resolves to are deliberately NOT here yet.
 * They arrive with the execution worker, together with the review that has to
 * accompany them; adding plausible-looking group names now would invite
 * somebody to believe they mean something.
 */

export interface AccessProfile {
  id: string;
  label: string;
  description: string;
  /**
   * The directory groups this profile resolves to, and the OU new accounts land
   * in. Reviewed as a unit: changing what a profile grants is a change to who
   * can do what, and it belongs in a diff somebody approves — not in a form
   * field an operator fills in while raising a request.
   */
  groups: string[];
  ou: string;
}

const BASE = "CN=HC-Base,OU=Groups,DC=corp,DC=example,DC=com";

export const ACCESS_PROFILES: readonly AccessProfile[] = [
  {
    id: "standard",
    label: "Standar karyawan",
    description: "Akses dasar: email, direktori, dan aplikasi umum perusahaan.",
    groups: [BASE],
    ou: "OU=Karyawan,DC=corp,DC=example,DC=com",
  },
  {
    id: "engineering",
    label: "Engineering",
    description: "Akses standar ditambah repository kode dan lingkungan pengembangan.",
    groups: [BASE, "CN=HC-Engineering,OU=Groups,DC=corp,DC=example,DC=com"],
    ou: "OU=Engineering,OU=Karyawan,DC=corp,DC=example,DC=com",
  },
  {
    id: "finance",
    label: "Finance",
    description: "Akses standar ditambah aplikasi keuangan dan pelaporan.",
    groups: [BASE, "CN=HC-Finance,OU=Groups,DC=corp,DC=example,DC=com"],
    ou: "OU=Finance,OU=Karyawan,DC=corp,DC=example,DC=com",
  },
  {
    id: "security",
    label: "IT Security",
    description: "Akses standar ditambah perkakas keamanan dan pemantauan.",
    groups: [BASE, "CN=HC-Security,OU=Groups,DC=corp,DC=example,DC=com"],
    ou: "OU=Security,OU=Karyawan,DC=corp,DC=example,DC=com",
  },
  {
    id: "none",
    label: "Tanpa akses aplikasi",
    description: "Hanya akun direktori. Dipakai saat akses aplikasi diajukan terpisah.",
    groups: [],
    ou: "OU=Karyawan,DC=corp,DC=example,DC=com",
  },
] as const;

/**
 * The groups a profile grants.
 *
 * `.all()` hangs off the same function on purpose: every caller that needs "is
 * this group one of ours?" gets it from the same catalogue that decides what a
 * profile grants, so the two can never drift apart. That question matters —
 * it is what stops a movement stripping a group this application never issued.
 */
export const accessProfileGroups = Object.assign(
  (id: string): string[] => [...(ACCESS_PROFILES.find((profile) => profile.id === id)?.groups ?? [])],
  {
    all: (): string[] => [...new Set(ACCESS_PROFILES.flatMap((profile) => profile.groups))],
  },
);

export function accessProfileOu(id: string): string {
  return (
    ACCESS_PROFILES.find((profile) => profile.id === id)?.ou ??
    "OU=Karyawan,DC=corp,DC=example,DC=com"
  );
}

/**
 * Where terminated accounts go.
 *
 * A separate OU rather than deletion: the object is retained so the history it
 * carries survives, and permanent removal is a different process with its own
 * approval. The plan is explicit that deletion is never the default here.
 */
export function quarantineOu(): string {
  return process.env.AD_QUARANTINE_OU?.trim() || "OU=Karantina,DC=corp,DC=example,DC=com";
}

export function isAccessProfileId(value: unknown): boolean {
  return typeof value === "string" && ACCESS_PROFILES.some((profile) => profile.id === value);
}

export function accessProfileLabel(id: string): string {
  return ACCESS_PROFILES.find((profile) => profile.id === id)?.label ?? id;
}
