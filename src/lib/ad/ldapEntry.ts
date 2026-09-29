import { containerOf, dnEquals } from "./ldapDn";
import { guidFromBytes } from "./ldapGuid";
import { AdError, type AdAccountState } from "./types";

/**
 * Turning a search result into the state the worker reasons about.
 *
 * Kept apart from the driver so the mapping is testable without a directory:
 * the interesting decisions here are all ones a fake client cannot exercise —
 * what an absent attribute means, which groups count, and what "enabled"
 * actually is.
 */

/**
 * Exactly the attributes this application uses, and no more.
 *
 * `*` would be shorter and is what every LDAP example does. It would also pull
 * back whatever else the schema holds about a person — employee numbers, home
 * addresses, a `msDS-*` sprawl — into the logs and the crash reports of an
 * application that has no business holding any of it. Password material and
 * LAPS attributes are not here, and are never requested.
 */
export const ACCOUNT_ATTRIBUTES = [
  "objectGUID",
  "distinguishedName",
  "sAMAccountName",
  "userPrincipalName",
  "displayName",
  "mail",
  "department",
  "title",
  "manager",
  "userAccountControl",
  "memberOf",
] as const;

/** objectGUID is binary; asking for it as text yields a mangled string. */
export const BINARY_ATTRIBUTES = ["objectGUID"] as const;

/** ADS_UF_ACCOUNTDISABLE. The only bit this application ever changes. */
export const ACCOUNTDISABLE = 0x2;

/** An entry as ldapts hands it back: values may be single or multiple, text or bytes. */
export interface DirectoryEntry {
  dn: string;
  [attribute: string]: Buffer | Buffer[] | string[] | string | undefined;
}

export function firstString(value: DirectoryEntry[string]): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.length ? String(value[0]) : "";
  return String(value);
}

export function stringList(value: DirectoryEntry[string]): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

function bytes(value: DirectoryEntry[string], attribute: string): Buffer {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (Buffer.isBuffer(candidate)) return candidate;
  throw new AdError(
    "UNKNOWN",
    `${attribute} tidak terbaca sebagai biner. Pencarian harus meminta atribut ini secara eksplisit sebagai buffer.`,
  );
}

/** Whether the ACCOUNTDISABLE bit is clear. */
export function isEnabled(userAccountControl: number): boolean {
  return (userAccountControl & ACCOUNTDISABLE) === 0;
}

/**
 * The same flags with only the disable bit moved.
 *
 * Read-modify-write, never a fixed value: userAccountControl also carries
 * "password never expires", "smartcard required", "trusted for delegation" and
 * a dozen more. Writing 512 to enable an account is a one-line way to silently
 * strip every one of them.
 */
export function withEnabled(userAccountControl: number, enabled: boolean): number {
  return enabled ? userAccountControl & ~ACCOUNTDISABLE : userAccountControl | ACCOUNTDISABLE;
}

/**
 * userAccountControl as a number.
 *
 * An unreadable value is refused rather than defaulted. Assuming "enabled"
 * would let the verification step confirm an account is live because the
 * attribute could not be read, which is the one reading this file exists to
 * prevent.
 */
export function parseUserAccountControl(value: DirectoryEntry[string]): number {
  const raw = firstString(value).trim();
  const parsed = Number.parseInt(raw, 10);
  if (!raw || Number.isNaN(parsed)) {
    throw new AdError(
      "UNKNOWN",
      "userAccountControl tidak terbaca, jadi status aktif akun tidak bisa dipastikan.",
    );
  }
  return parsed;
}

/**
 * Only the groups this application issues, spelled the way the catalogue spells
 * them, sorted.
 *
 * Both halves matter. Returning every `memberOf` would make a profile update's
 * postcondition require a membership somebody added by hand — the verification
 * step compares the list it read before against the list it reads after, so an
 * unrelated group granted meanwhile would fail an unrelated request. And
 * returning the DIRECTORY's spelling rather than the catalogue's would fail the
 * same comparison over the spaces after a comma.
 */
export function managedGroupsOf(
  memberOf: DirectoryEntry[string],
  managed: readonly string[],
): string[] {
  const held = stringList(memberOf);
  return managed.filter((group) => held.some((candidate) => dnEquals(candidate, group))).sort();
}

/**
 * The account state, given an entry and the manager's account name.
 *
 * `manager` arrives already resolved because the directory stores it as a DN
 * and the worker compares it as a sAMAccountName — a translation that needs a
 * second search, which belongs in the driver rather than in a pure mapping.
 */
export function accountFromEntry(
  entry: DirectoryEntry,
  options: { managedGroups: readonly string[]; manager?: string },
): AdAccountState {
  const dn = firstString(entry.distinguishedName) || entry.dn;
  if (!dn) {
    throw new AdError("UNKNOWN", "Objek direktori tidak menyertakan distinguishedName.");
  }

  return {
    objectGUID: guidFromBytes(bytes(entry.objectGUID, "objectGUID")),
    sAMAccountName: firstString(entry.sAMAccountName),
    userPrincipalName: firstString(entry.userPrincipalName),
    displayName: firstString(entry.displayName),
    mail: firstString(entry.mail),
    department: firstString(entry.department),
    title: firstString(entry.title),
    manager: options.manager || undefined,
    enabled: isEnabled(parseUserAccountControl(entry.userAccountControl)),
    ou: containerOf(dn),
    groups: managedGroupsOf(entry.memberOf, options.managedGroups),
  };
}

/** The manager DN an entry names, if it names one. */
export function managerDnOf(entry: DirectoryEntry): string | undefined {
  return firstString(entry.manager) || undefined;
}
