import { EMPLOYMENT_KINDS } from "./employment";
import type { EmploymentType } from "./types";

/**
 * Building the corporate address the way the company writes them.
 *
 * First and last name run together, lower case, then the digit that says what
 * kind of employment it is — 1 or 2 permanent, 3 or 4 temporary, 5 or 6 vendor,
 * 7 or 8 intern. `nadiakusuma1`, `budisantoso5`. The domain is chosen from the
 * two the company uses rather than typed, because a typo in a domain is a new
 * mailbox nobody will ever read.
 *
 * Suggested, never imposed. HC can edit the local part before submitting: a
 * second Nadia Kusuma needs the other digit of her range, an agency numbers its
 * own people, and somebody's legal name will eventually contain something this
 * strips. The server keeps validating it as an address and nothing more.
 */

export const COMPANY_EMAIL_DOMAINS = [
  "@mandirisekuritas.co.id",
  "@mansek.co.id",
] as const;

export type CompanyEmailDomain = (typeof COMPANY_EMAIL_DOMAINS)[number];

export const DEFAULT_EMAIL_DOMAIN: CompanyEmailDomain = COMPANY_EMAIL_DOMAINS[0];

/** The first digit of a kind's range: the one a first holder of a name gets. */
export function employmentDigit(type: EmploymentType): string {
  const kind = EMPLOYMENT_KINDS.find((candidate) => candidate.type === type);
  return String(kind?.codes[0] ?? "");
}

/**
 * The part before the @, suggested from a name and a kind of employment.
 *
 * Everything a mailbox will not take is dropped rather than replaced: a dot or
 * a dash inserted for a space would make two people with the same name differ
 * by punctuation, which is the kind of difference nobody notices when typing an
 * address from memory.
 */
export function companyEmailLocalPart(
  firstName: string,
  lastName: string,
  type: EmploymentType,
): string {
  const name = `${firstName}${lastName}`
    .toLowerCase()
    .normalize("NFD")
    // Accents become the letter underneath rather than disappearing with it.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

  return name ? `${name}${employmentDigit(type)}` : "";
}

/** Splits a stored address back into the two controls the form shows. */
export function splitCompanyEmail(email: string): { local: string; domain: string } {
  const at = email.lastIndexOf("@");
  if (at < 0) return { local: email, domain: DEFAULT_EMAIL_DOMAIN };
  return { local: email.slice(0, at), domain: email.slice(at) };
}
