import type { Employee } from "@/lib/types";

import type { ProfileChange, ProfileField, ProfileFields } from "./types";

/**
 * Working out what a profile update actually changes.
 *
 * Pure on purpose: the server uses it to compute the diff that is frozen into
 * the request, and the edit form uses the very same function to preview it, so
 * what HC sees before sending and what the approvers are asked about cannot
 * disagree.
 */

/** Display order, which is also the order the approvers read the changes in. */
export const PROFILE_FIELDS: readonly ProfileField[] = [
  "firstName",
  "lastName",
  "displayName",
  "department",
  "jobTitle",
  "jobDescription",
  "employmentType",
  "expiredDate",
  "locationType",
  "branchName",
  "description",
];

export const PROFILE_FIELD_LABEL: Record<ProfileField, string> = {
  firstName: "Nama depan",
  lastName: "Nama belakang",
  displayName: "Nama lengkap",
  department: "Departemen",
  jobTitle: "Jabatan",
  jobDescription: "Keterangan jabatan",
  employmentType: "Status kepegawaian",
  expiredDate: "Kontrak berakhir",
  locationType: "Lokasi penempatan",
  branchName: "Nama cabang",
  description: "Catatan HC",
};

/**
 * The one field that stays inside the portal.
 *
 * The HC note is an internal record. An approver is told that it changed — a
 * silent change would be a change nobody approved — but not what it says.
 */
export const INTERNAL_PROFILE_FIELDS: readonly ProfileField[] = ["description"];

export const REDACTED_VALUE = "(catatan internal — isinya tidak dikirim lewat email)";

/** The editable profile of an employee as it stands now. */
export function profileOf(employee: Employee): ProfileFields {
  return {
    firstName: employee.firstName,
    lastName: employee.lastName,
    displayName: employee.displayName,
    jobTitle: employee.jobTitle,
    jobDescription: employee.jobDescription,
    department: employee.department,
    employmentType: employee.employmentType,
    expiredDate: employee.expiredDate,
    locationType: employee.locationType,
    branchName: employee.branchName,
    description: employee.description,
  };
}

/**
 * Human-readable form of one value.
 *
 * Dates are compared and shown as yyyy-MM-dd: the record may hold a full ISO
 * timestamp while the form sends a bare date, and treating those as different
 * would report a change nobody made.
 */
export function displayValue(field: ProfileField, value: string | undefined): string {
  const text = value?.trim() ?? "";
  if (!text) return "—";

  if (field === "employmentType") {
    return text === "CONTRACT" ? "Kontrak" : text === "PERMANENT" ? "Karyawan tetap" : text;
  }
  if (field === "locationType") {
    return text === "CABANG" ? "Cabang" : text === "PUSAT" ? "Kantor pusat" : text;
  }
  if (field === "expiredDate") return text.slice(0, 10);
  return text;
}

/** Every field whose displayed value differs, in display order. */
export function diffProfile(before: ProfileFields, after: ProfileFields): ProfileChange[] {
  const changes: ProfileChange[] = [];

  for (const field of PROFILE_FIELDS) {
    const from = displayValue(field, before[field]);
    const to = displayValue(field, after[field]);
    if (from !== to) changes.push({ field, label: PROFILE_FIELD_LABEL[field], from, to });
  }

  return changes;
}
