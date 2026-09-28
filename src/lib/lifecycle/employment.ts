import type { EmploymentType } from "./types";

/**
 * The four kinds of employment, and the digit each one ends an address with.
 *
 * The company encodes status in the account itself: a corporate address is the
 * first and last name run together with a digit at the end, and that digit says
 * what kind of employment it is. 1 or 2 is permanent, 3 or 4 a contract, 5 or 6
 * a vendor, 7 or 8 an intern.
 *
 * Kept in one place because it is written in two: the hint under the address
 * field that tells HC the convention, and the label beside each employment type.
 * Two copies of a rule like this drift, and the drift is invisible until
 * somebody is given the wrong kind of account.
 *
 * The digits are not enforced. HC types the address, and a convention the
 * server refuses is a convention that stops working the first time an exception
 * is legitimate — a second permanent hire whose name collides, an agency that
 * numbers its own people. It is written down here so it can be followed, not
 * policed.
 */

export interface EmploymentKind {
  type: EmploymentType;
  /** The digits an address of this kind ends with. */
  codes: readonly [number, number];
  /** Fixed-term kinds carry an end date; permanent employment does not. */
  fixedTerm: boolean;
}

export const EMPLOYMENT_KINDS: readonly EmploymentKind[] = [
  { type: "PERMANENT", codes: [1, 2], fixedTerm: false },
  { type: "CONTRACT", codes: [3, 4], fixedTerm: true },
  { type: "VENDOR", codes: [5, 6], fixedTerm: true },
  { type: "INTERN", codes: [7, 8], fixedTerm: true },
];

export const EMPLOYMENT_TYPES: readonly EmploymentType[] = EMPLOYMENT_KINDS.map(
  (kind) => kind.type,
);

/** "1-2", "3-4" … for showing beside the name of each kind. */
export function employmentCodeRange(type: EmploymentType): string {
  const kind = EMPLOYMENT_KINDS.find((candidate) => candidate.type === type);
  return kind ? `${kind.codes[0]}-${kind.codes[1]}` : "";
}

/**
 * Whether this kind of employment ends on a date.
 *
 * Everything except permanent does, which is why the end date is asked for and
 * kept for contracts, vendors and interns alike. An account whose end date was
 * dropped because the type was not "CONTRACT" is an account nobody is watching.
 */
export function isFixedTerm(type: EmploymentType | undefined): boolean {
  return EMPLOYMENT_KINDS.some((kind) => kind.type === type && kind.fixedTerm);
}
