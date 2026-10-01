import { isAccessProfileId } from "@/lib/lifecycle/accessProfiles";
import { EMPLOYMENT_TYPES, isFixedTerm } from "@/lib/lifecycle/employment";
import {
  DATE_BOUNDS,
  checkDate,
  jakartaDay,
  nextJakartaDay,
  startOfJakartaDay,
  type DateBounds,
} from "@/lib/validation/dates";
import { parseEmployeeProfileInput } from "@/lib/validation/employeeProfileInput";
import {
  LIFECYCLE_TYPES,
  TERMINATION_REASONS,
  type LifecyclePayload,
  type LifecycleType,
  type TerminationReason,
  type EmploymentType,
} from "@/lib/lifecycle/types";

/**
 * Validation for the three lifecycle forms.
 *
 * Same shape as the other validators in this folder — per-field errors in the
 * language of the UI — rather than a schema library, so the forms keep
 * rendering messages inline the way they already do.
 *
 * Note what HC is not allowed to supply anywhere below: an OU, a group name, a
 * distinguished name, a PowerShell fragment, or a password. Access is chosen as
 * a catalogue profile and resolved server-side.
 */

export type LifecycleErrors = Record<string, string>;

export interface LifecycleInputValue {
  payload: LifecyclePayload;
  effectiveAt?: string;
}

export type LifecycleInputResult =
  | { ok: true; value: LifecycleInputValue }
  | { ok: false; errors: LifecycleErrors };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Collects a required string with a length range.
 *
 * Named `requireField` rather than `require` so it cannot be mistaken for the
 * CommonJS global it would otherwise shadow.
 */
function requireField(
  errors: LifecycleErrors,
  body: Record<string, unknown>,
  field: string,
  label: string,
  min: number,
  max: number,
): string {
  const value = asString(body[field]);
  if (!value) errors[field] = `${label} wajib diisi.`;
  else if (value.length < min) errors[field] = `${label} minimal ${min} karakter.`;
  else if (value.length > max) errors[field] = `${label} maksimal ${max} karakter.`;
  return value;
}

function optional(
  errors: LifecycleErrors,
  body: Record<string, unknown>,
  field: string,
  label: string,
  max: number,
): string | undefined {
  const value = asString(body[field]);
  if (value.length > max) errors[field] = `${label} maksimal ${max} karakter.`;
  return value || undefined;
}

function email(errors: LifecycleErrors, field: string, value: string, label: string): string {
  if (value && !EMAIL_PATTERN.test(value)) errors[field] = `${label} tidak valid.`;
  return value.toLowerCase();
}

/**
 * Optional since the field left the forms, and still checked when it is there.
 *
 * Absent means "this request does not decide access": an onboarding then gets
 * the standard profile and a movement leaves groups alone. An unknown id is
 * still refused rather than stored — a profile nothing can resolve would fail
 * in the worker, halfway through, instead of here.
 */
function accessProfile(
  errors: LifecycleErrors,
  body: Record<string, unknown>,
): string | undefined {
  const value = asString(body.accessProfileId);
  if (!value) return undefined;
  if (!isAccessProfileId(value)) errors.accessProfileId = "Profil akses tidak dikenal.";
  return value;
}

/**
 * The login name, checked against what a directory will actually accept.
 *
 * Lower-cased rather than rejected for case: a sAMAccountName is compared
 * case-insensitively by the directory, so "Nadia" and "nadia" are the same
 * account, and storing whichever was typed would make two records look
 * different while naming one thing.
 */
function accountName(errors: LifecycleErrors, body: Record<string, unknown>): string {
  const value = asString(body.userId).toLowerCase();
  if (!value) {
    errors.userId = "User ID wajib diisi.";
  } else if (!/^[a-z0-9][a-z0-9._-]{1,19}$/.test(value)) {
    errors.userId =
      "User ID hanya boleh huruf kecil, angka, titik, garis bawah, dan tanda hubung, 2-20 karakter, diawali huruf atau angka.";
  }
  return value;
}

/**
 * A date that is real and plausible for what it means — see validation/dates.ts
 * for why "parses" was not enough.
 */
function date(
  errors: LifecycleErrors,
  body: Record<string, unknown>,
  field: string,
  label: string,
  required: boolean,
  bounds: DateBounds,
  now: Date,
): string | undefined {
  const value = asString(body[field]);
  if (!value) {
    if (required) errors[field] = `${label} wajib diisi.`;
    return undefined;
  }
  const check = checkDate(value, label, bounds, now);
  if (!check.ok) {
    errors[field] = check.message;
    return undefined;
  }
  return value;
}

export function parseLifecycleRequestInput(payload: unknown, now = new Date()): LifecycleInputResult {
  const body = (payload ?? {}) as Record<string, unknown>;
  const errors: LifecycleErrors = {};

  const type = asString(body.type).toUpperCase() as LifecycleType;
  if (!(LIFECYCLE_TYPES as readonly string[]).includes(type)) {
    return {
      ok: false,
      errors: { type: "Jenis pengajuan harus Onboarding, Movement, Termination, atau Perubahan Profil." },
    };
  }

  /*
   * When the approved change runs. An onboarding has none: its account is made
   * as soon as both approvals are in, whatever dates the form carries — the
   * start date is recorded as the first day of work and schedules nothing. Two
   * date fields meant HC set a start date of today and an effective date months
   * out, and watched the new hire never appear.
   */
  const effectiveAt =
    type === "ONBOARDING"
      ? undefined
      : date(errors, body, "effectiveAt", "Waktu efektif", false, DATE_BOUNDS.effectiveAt, now);

  let built: LifecyclePayload | undefined;

  if (type === "ONBOARDING") {
    const firstName = requireField(errors, body, "firstName", "Nama depan", 1, 80);
    const lastName = requireField(errors, body, "lastName", "Nama belakang", 1, 80);
    const displayName = requireField(errors, body, "displayName", "Nama lengkap", 2, 160);
    const address = email(errors, "email", requireField(errors, body, "email", "Email", 5, 200), "Email");
    const userId = accountName(errors, body);
    const jobTitle = requireField(errors, body, "jobTitle", "Jabatan", 2, 120);
    const department = requireField(errors, body, "department", "Departemen", 2, 120);
    const managerName = requireField(errors, body, "managerName", "Nama manager", 2, 120);
    const managerEmail = email(
      errors,
      "managerEmail",
      requireField(errors, body, "managerEmail", "Email manager", 5, 200),
      "Email manager",
    );
    const startDate =
      date(errors, body, "startDate", "Tanggal mulai", false, DATE_BOUNDS.startDate, now) ??
      jakartaDay(now);
    const accessProfileId = accessProfile(errors, body);
    const jobDescription = optional(errors, body, "jobDescription", "Keterangan jabatan", 2000);

    const employmentType = asString(body.employmentType).toUpperCase() as EmploymentType;
    if (!EMPLOYMENT_TYPES.includes(employmentType)) {
      errors.employmentType = "Status kepegawaian harus Tetap, Kontrak, Vendor, atau Magang.";
    }
    /*
     * Everything except permanent ends on a date, and an end date left empty
     * reads as permanent to everyone downstream — including the person who has
     * to notice that a vendor's access should have stopped in March.
     */
    const expiredDate = isFixedTerm(employmentType)
      ? date(errors, body, "expiredDate", "Tanggal terakhir bekerja", true, DATE_BOUNDS.newContractEnd, now)
      : undefined;

    const locationType = asString(body.locationType).toUpperCase();
    if (locationType !== "PUSAT" && locationType !== "CABANG") {
      errors.locationType = "Lokasi harus Pusat atau Cabang.";
    }
    const branchName = locationType === "CABANG" ? requireField(errors, body, "branchName", "Nama cabang", 2, 120) : undefined;

    if (Object.keys(errors).length === 0) {
      built = {
        kind: "ONBOARDING",
        firstName,
        lastName,
        displayName,
        email: address,
        userId,
        jobTitle,
        jobDescription,
        department,
        employmentType,
        expiredDate,
        locationType: locationType as "PUSAT" | "CABANG",
        branchName,
        managerName,
        managerEmail,
        startDate: startDate!,
        accessProfileId,
      };
    }
  }

  if (type === "MOVEMENT") {
    const employeeId = requireField(errors, body, "employeeId", "Karyawan", 1, 120);
    const toDepartment = requireField(errors, body, "toDepartment", "Departemen tujuan", 2, 120);
    const toJobTitle = requireField(errors, body, "toJobTitle", "Jabatan tujuan", 2, 120);
    const toManagerName = requireField(errors, body, "toManagerName", "Nama manager tujuan", 2, 120);
    const toManagerEmail = email(
      errors,
      "toManagerEmail",
      requireField(errors, body, "toManagerEmail", "Email manager tujuan", 5, 200),
      "Email manager tujuan",
    );
    const accessProfileId = accessProfile(errors, body);
    // No longer asked for on the form, and no longer required — but still
    // accepted, so an older client or a revision of an older request keeps its.
    const reason = optional(errors, body, "reason", "Alasan pemindahan", 2000);
    const toJobDescription = optional(errors, body, "toJobDescription", "Keterangan jabatan", 2000);

    if (Object.keys(errors).length === 0) {
      built = {
        kind: "MOVEMENT",
        employeeId,
        toDepartment,
        toJobTitle,
        toJobDescription,
        toManagerName,
        toManagerEmail,
        accessProfileId,
        reason,
      };
    }
  }

  if (type === "TERMINATION") {
    const employeeId = requireField(errors, body, "employeeId", "Karyawan", 1, 120);
    const lastWorkingDate = date(errors, body, "lastWorkingDate", "Tanggal terakhir bekerja", true, DATE_BOUNDS.lastWorkingDate, now);

    /*
     * Optional now, and validated only when it is there: the form no longer
     * asks. An unknown value is still refused rather than stored — a category
     * nothing can render is worse than none at all.
     */
    const givenReason = asString(body.reasonCategory).toUpperCase();
    if (givenReason && !(TERMINATION_REASONS as readonly string[]).includes(givenReason)) {
      errors.reasonCategory = "Kategori alasan tidak dikenal.";
    }
    const reasonCategory = givenReason ? (givenReason as TerminationReason) : undefined;

    const handoverTo = optional(errors, body, "handoverTo", "Serah terima kepada", 160);
    // Kept internal on purpose: this never travels into an approval email.
    const note = optional(errors, body, "note", "Catatan", 2000);

    if (Object.keys(errors).length === 0) {
      built = {
        kind: "TERMINATION",
        employeeId,
        reasonCategory,
        lastWorkingDate: lastWorkingDate!,
        handoverTo,
        note,
      };
    }
  }

  if (type === "PROFILE_UPDATE") {
    const employeeId = requireField(errors, body, "employeeId", "Karyawan", 1, 120);
    const profile = parseEmployeeProfileInput(body, now);
    if (!profile.ok) Object.assign(errors, profile.errors);

    if (Object.keys(errors).length === 0 && profile.ok) {
      built = {
        kind: "PROFILE_UPDATE",
        employeeId,
        profile: profile.value,
        // Deliberately empty. Anything the browser sends here is ignored: the
        // diff approvers read is computed by the server against the record.
        changes: [],
      };
    }
  }

  if (Object.keys(errors).length > 0 || !built) return { ok: false, errors };

  /*
   * A termination needs one date, not two.
   *
   * The form used to ask for the last working day AND the day to switch the
   * account off, which is one fact asked twice and two ways to get it wrong:
   * a gap where somebody has left and can still sign in, or an account taken
   * away on the morning of the day they were told they still had. So the
   * effective moment is derived — the start of the day AFTER the last working
   * day — and an explicit one is still honoured, because requests raised
   * before this carry theirs.
   */
  const runAt =
    effectiveAt ??
    (built.kind === "TERMINATION" ? nextJakartaDay(built.lastWorkingDate) : undefined);

  return {
    ok: true,
    value: { payload: built, effectiveAt: runAt ? startOfJakartaDay(runAt) : undefined },
  };
}
