import type { EmployeeProfilePatch } from "@/lib/db/repository";

/**
 * Validation for the edit-profile form, in the same shape as userInput.ts:
 * per-field errors the form renders inline, in the language of the UI.
 */

export type ProfileField = keyof EmployeeProfilePatch;

export type ProfileErrors = Partial<Record<ProfileField, string>>;

export type ProfileResult =
  | { ok: true; value: EmployeeProfilePatch }
  | { ok: false; errors: ProfileErrors };

const REQUIRED: ReadonlyArray<readonly [ProfileField, string, number, number]> = [
  ["firstName", "Nama depan", 1, 80],
  ["lastName", "Nama belakang", 1, 80],
  ["displayName", "Nama lengkap", 2, 160],
  ["jobTitle", "Jabatan", 2, 120],
  ["department", "Departemen", 2, 120],
] as const;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseEmployeeProfileInput(payload: unknown): ProfileResult {
  const body = (payload ?? {}) as Record<string, unknown>;
  const errors: ProfileErrors = {};
  const draft: Record<string, string> = {};

  for (const [field, label, min, max] of REQUIRED) {
    const value = asString(body[field]);
    if (!value) errors[field] = `${label} wajib diisi.`;
    else if (value.length < min) errors[field] = `${label} minimal ${min} karakter.`;
    else if (value.length > max) errors[field] = `${label} maksimal ${max} karakter.`;
    draft[field] = value;
  }

  const employmentType = asString(body.employmentType).toUpperCase();
  if (employmentType && employmentType !== "PERMANENT" && employmentType !== "CONTRACT") {
    errors.employmentType = "Status kepegawaian harus Tetap atau Kontrak.";
  }

  const expiredDate = asString(body.expiredDate);
  if (employmentType === "CONTRACT") {
    // A contract without an end date is the case this form exists to catch:
    // the record then looks permanent to everyone reading it later.
    if (!expiredDate) {
      errors.expiredDate = "Tanggal berakhir kontrak wajib diisi untuk karyawan kontrak.";
    } else if (Number.isNaN(Date.parse(expiredDate))) {
      errors.expiredDate = "Tanggal berakhir kontrak tidak valid.";
    }
  }

  const locationType = asString(body.locationType).toUpperCase();
  if (locationType && locationType !== "PUSAT" && locationType !== "CABANG") {
    errors.locationType = "Lokasi harus Pusat atau Cabang.";
  }

  const branchName = asString(body.branchName);
  if (locationType === "CABANG" && !branchName) {
    errors.branchName = "Nama cabang wajib diisi untuk penempatan di cabang.";
  }

  const jobDescription = asString(body.jobDescription);
  if (jobDescription.length > 2000) {
    errors.jobDescription = "Keterangan jabatan maksimal 2000 karakter.";
  }

  const description = asString(body.description);
  if (description.length > 2000) {
    errors.description = "Catatan maksimal 2000 karakter.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      firstName: draft.firstName,
      lastName: draft.lastName,
      displayName: draft.displayName,
      jobTitle: draft.jobTitle,
      jobDescription: jobDescription || undefined,
      department: draft.department,
      employmentType: employmentType ? (employmentType as "PERMANENT" | "CONTRACT") : undefined,
      expiredDate: employmentType === "CONTRACT" ? expiredDate : undefined,
      locationType: locationType ? (locationType as "PUSAT" | "CABANG") : undefined,
      branchName: locationType === "CABANG" ? branchName : undefined,
      description: description || undefined,
    },
  };
}
