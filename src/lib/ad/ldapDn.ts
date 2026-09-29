/**
 * Distinguished names, compared and taken apart.
 *
 * Every rule in this file exists because the obvious string operation is wrong
 * in a way that is invisible until it matters:
 *
 *   - `dn.includes(ou)` reports that `CN=x,OU=Engineering,OU=Karyawan,...` sits
 *     inside `OU=Karyawan,...` — which it does — and also that
 *     `CN=x,OU=Ex-Karyawan,...` does. A containment test compares whole
 *     components, right-anchored, or it is not a containment test.
 *   - `dn.split(",")` splits `CN=Wulandari\, Citra,OU=...` in the middle of the
 *     name. A comma inside a value is escaped, and the splitter has to know.
 *   - `a.toLowerCase() === b.toLowerCase()` is close enough for AD attribute
 *     names but says two DNs differ over the spaces after their commas.
 *
 * The comparisons are deliberately conservative: DN syntax allows far more than
 * this (hex-encoded values, multi-valued RDNs, unicode escapes), and a parser
 * that tried to canonicalise all of it would be a liability. These functions
 * normalise whitespace and case, and nothing else — so two spellings that this
 * calls different are refused rather than quietly acted on.
 */

/**
 * Splits a DN into its components, respecting `\,` escapes.
 *
 * Quoted values (`CN="Wulandari, Citra"`) are the older RFC 1779 form and are
 * NOT understood here. AD emits the escaped form, so accepting both would mean
 * supporting a spelling nothing in this system produces.
 */
export function splitDn(dn: string): string[] {
  const parts: string[] = [];
  let current = "";
  let escaped = false;

  for (const char of dn) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (char === ",") {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);

  return parts.map((part) => part.trim()).filter(Boolean);
}

/** A DN in comparable form: whole components, trimmed and lower-cased. */
export function normaliseDn(dn: string): string {
  return splitDn(dn)
    .map((part) => part.toLowerCase())
    .join(",");
}

export function dnEquals(left: string, right: string): boolean {
  return normaliseDn(left) === normaliseDn(right);
}

/** The leftmost component — `CN=Citra Wulandari` — with its escapes intact. */
export function rdnOf(dn: string): string {
  return splitDn(dn)[0] ?? "";
}

/**
 * The container a DN sits in: everything but its own leftmost component.
 *
 * This is what `AdAccountState.ou` is derived from, which is why it is not
 * merely "the first OU= component": an object parked directly under
 * `DC=corp,DC=example,DC=com` has a container and no OU at all, and reporting
 * an empty string for it would make the verification step compare against
 * nothing and pass.
 */
export function containerOf(dn: string): string {
  return splitDn(dn).slice(1).join(",");
}

/**
 * Whether `dn` sits inside `container`, at any depth.
 *
 * Right-anchored on whole components. An object IS NOT inside itself: passing
 * the same DN twice returns false, so an OU can never authorise writes to its
 * own object.
 */
export function isWithin(dn: string, container: string): boolean {
  const subject = splitDn(dn).map((part) => part.toLowerCase());
  const parent = splitDn(container).map((part) => part.toLowerCase());
  if (parent.length === 0 || subject.length <= parent.length) return false;

  const offset = subject.length - parent.length;
  return parent.every((part, index) => subject[offset + index] === part);
}

/**
 * Whether a write may touch this DN.
 *
 * True when the DN is inside one of the managed containers, or IS one of them
 * — the second case is what lets `AD_MANAGED_OUS` name the OU a new account is
 * created in. An empty allow-list permits nothing, which is the right answer
 * for a deployment that has not said where this application may write.
 */
export function isManaged(dn: string, managedOus: readonly string[]): boolean {
  return managedOus.some((ou) => dnEquals(dn, ou) || isWithin(dn, ou));
}

/**
 * RFC 4514 escaping for a value going INTO a DN component.
 *
 * Used for exactly one thing: building `CN=<display name>` for a new account.
 * A name with a comma in it is common enough ("Wulandari, Citra") that the
 * unescaped version would produce a DN with a component the server rejects —
 * or, worse, one it accepts as two components.
 */
export function escapeDnValue(value: string): string {
  return value
    .replace(/([\\,+"<>;=])/g, "\\$1")
    .replace(/^([ #])/, "\\$1")
    .replace(/ $/, "\\ ")
    .replace(/\0/g, "\\00");
}
