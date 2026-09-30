import type { Employee } from "@/lib/types";

/**
 * Which request one screen of edits actually is.
 *
 * Edit profil used to be three tabs, and the tab was how HC told the portal
 * what kind of request they meant. One form is simpler to use and moves that
 * decision here: you change what is true about somebody, and what you changed
 * decides which request gets raised.
 *
 * The split is not arbitrary, and there is no overlap in it:
 *
 *   - Division, job title and manager live in the DIRECTORY. Changing one is a
 *     Movement: it is routed to the manager who is taking the person on, and
 *     the worker writes it to Active Directory and reads it back.
 *   - Employment type, end date and place of work live only in this PORTAL.
 *     Changing one is a profile update, approved by the current manager.
 *   - A last working day is a Termination, whatever else is on the screen.
 *
 * Two kinds at once is refused rather than guessed. Both are real requests with
 * different approvers and different effects, and a form that silently picked
 * one would drop the other on the floor — which is worse than saying so.
 */

export type EditIntent = "NONE" | "MOVEMENT" | "PROFILE_UPDATE" | "TERMINATION" | "MIXED";

/** The editable half of the form, as strings, the way inputs hold them. */
export interface EditValues {
  jobTitle: string;
  department: string;
  managerEmail: string;
  employmentType: string;
  expiredDate: string;
  locationType: string;
  branchName: string;
  /** Empty unless the account is being closed. */
  lastWorkingDate: string;
}

function same(left: string | undefined, right: string | undefined): boolean {
  return (left ?? "").trim() === (right ?? "").trim();
}

/** A date input holds yyyy-MM-dd; the record may hold a full timestamp. */
function sameDay(left: string | undefined, right: string | undefined): boolean {
  return same(left?.slice(0, 10), right?.slice(0, 10));
}

/** Whether anything the directory holds has been changed. */
export function isMovement(employee: Employee, values: EditValues): boolean {
  return (
    !same(employee.jobTitle, values.jobTitle) ||
    !same(employee.department, values.department) ||
    !same(employee.managerEmail.toLowerCase(), values.managerEmail.toLowerCase())
  );
}

/** Whether anything only this portal holds has been changed. */
export function isProfileUpdate(employee: Employee, values: EditValues): boolean {
  return (
    !same(employee.employmentType, values.employmentType) ||
    !sameDay(employee.expiredDate, values.expiredDate) ||
    !same(employee.locationType, values.locationType) ||
    !same(employee.branchName, values.branchName)
  );
}

export function editIntent(employee: Employee, values: EditValues): EditIntent {
  const leaving = values.lastWorkingDate.trim() !== "";
  const moved = isMovement(employee, values);
  const profiled = isProfileUpdate(employee, values);

  // A termination alongside other edits: the other edits would be applied to an
  // account that is about to be closed, by a separate approval chain, which is
  // never what somebody filling this in means.
  if (leaving) return moved || profiled ? "MIXED" : "TERMINATION";
  if (moved && profiled) return "MIXED";
  if (moved) return "MOVEMENT";
  if (profiled) return "PROFILE_UPDATE";
  return "NONE";
}
