import { isCanonicalGuid } from "./ldapGuid";
import { AdError } from "./types";

/**
 * LDAP search filters, built rather than concatenated.
 *
 * A filter is a query language, and a value spliced into one unescaped is the
 * same class of problem as SQL injection: an account name of `*` matches every
 * object, and `x)(objectClass=*` ends one clause and opens another. AD accepts
 * both cheerfully. Everything a caller supplies goes through
 * `escapeFilterValue` on its way in, and the filters below are the only ones
 * this driver sends.
 *
 * `objectCategory=person` sits in front of `objectClass=user` on purpose:
 * objectCategory is single-valued and indexed, objectClass is neither, and
 * computer accounts are `objectClass=user` too. The pair is the standard way to
 * mean "a user, not a machine".
 */

/**
 * RFC 4515 escaping.
 *
 * One pass, so the backslash it inserts cannot be escaped again — a two-pass
 * implementation that handled `\` first and `(` second would turn `\(` into
 * `\5c28` instead of `\5c\28`.
 */
export function escapeFilterValue(value: string): string {
  return value.replace(
    /[\\*()\0]/g,
    (char) => `\\${char.charCodeAt(0).toString(16).padStart(2, "0")}`,
  );
}

export function equals(attribute: string, value: string): string {
  return `(${attribute}=${escapeFilterValue(value)})`;
}

/** Wraps a clause so it only matches real user accounts. */
export function userFilter(clause: string): string {
  return `(&(objectCategory=person)(objectClass=user)${clause})`;
}

export function accountNameFilter(sAMAccountName: string): string {
  return userFilter(equals("sAMAccountName", sAMAccountName));
}

/** Any user account, for a search whose base already names one object. */
export function anyUserFilter(): string {
  return "(&(objectCategory=person)(objectClass=user))";
}

/**
 * The search base that names one object by its GUID.
 *
 * `<GUID=...>` is Active Directory's own extended DN form, and using it here
 * replaces something that looked correct and was not: a subtree search for
 * `(objectGUID=\9c\0b\ae\fe...)`. The directory answers that filter perfectly
 * well — it was verified against a real domain controller — but the escaped
 * bytes do not survive the client library's filter parser, which reads them as
 * characters and re-encodes them as UTF-8. The search then matched nothing, in
 * the quietest possible way: no error, no entry, "account not found".
 *
 * This form sends no binary at all, and a base-scoped read is cheaper than a
 * subtree search besides. The object still has to pass the user filter, so the
 * GUID of an OU or a group resolves to nothing rather than to an account.
 */
export function guidBaseDn(objectGUID: string): string {
  const guid = objectGUID.trim().toLowerCase();
  if (!isCanonicalGuid(guid)) {
    throw new AdError("UNKNOWN", `objectGUID "${objectGUID}" bukan GUID yang sah, jadi tidak bisa dicari.`);
  }
  return `<GUID=${guid}>`;
}

/**
 * Members of a group.
 *
 * `nested` switches to AD's LDAP_MATCHING_RULE_IN_CHAIN, which walks group
 * nesting server-side. It is off by default, and that default is a decision
 * rather than caution: the group this is used for names who may approve an
 * access request, and with nesting on, adding a group to a group grants that
 * authority to everybody inside it — possibly without anyone realising the
 * outer group was an approver list at all. Direct membership is a list somebody
 * can read.
 */
export function groupMembersFilter(groupDn: string, options: { nested?: boolean } = {}): string {
  const attribute = options.nested ? "memberOf:1.2.840.113556.1.4.1941:" : "memberOf";
  return userFilter(`(${attribute}=${escapeFilterValue(groupDn)})`);
}

/** The group object itself, so a DN nobody recognises is reported as such. */
export function groupFilter(groupDn: string): string {
  return `(&(objectClass=group)${equals("distinguishedName", groupDn)})`;
}
