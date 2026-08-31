import type { NewUserInput } from "@/lib/types";

/**
 * Hand-rolled validation for the create-user form. Small enough not to warrant a
 * schema library, and it returns per-field errors the form can render inline.
 */

export type FieldErrors = Partial<Record<keyof NewUserInput, string>>;

export type ValidationResult =
  | { ok: true; value: NewUserInput }
  | { ok: false; errors: FieldErrors };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const REQUIRED_FIELDS = [
  ["name", "Full name", 2, 120],
  ["email", "Work email", 5, 200],
  ["jobTitle", "Job title", 2, 120],
  ["department", "Department", 2, 120],
  ["managerName", "Manager name", 2, 120],
  ["managerEmail", "Manager email", 5, 200],
] as const;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseNewUserInput(payload: unknown): ValidationResult {
  const body = (payload ?? {}) as Record<string, unknown>;
  const errors: FieldErrors = {};
  const draft: Record<string, string> = {};

  for (const [field, label, min, max] of REQUIRED_FIELDS) {
    const value = asString(body[field]);
    if (!value) {
      errors[field] = `${label} is required.`;
    } else if (value.length < min) {
      errors[field] = `${label} must be at least ${min} characters.`;
    } else if (value.length > max) {
      errors[field] = `${label} must be at most ${max} characters.`;
    }
    draft[field] = value;
  }

  if (!errors.email && !EMAIL_PATTERN.test(draft.email)) {
    errors.email = "Enter a valid work email address.";
  }

  // The manager's email is how the approval ticket gets assigned, which is what
  // makes Jira notify them — so it is required, not optional.
  if (!errors.managerEmail && !EMAIL_PATTERN.test(draft.managerEmail)) {
    errors.managerEmail = "Enter a valid email address for the manager.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const managerAccountId = asString(body.managerAccountId);

  return {
    ok: true,
    value: {
      name: draft.name,
      email: draft.email.toLowerCase(),
      jobTitle: draft.jobTitle,
      department: draft.department,
      managerName: draft.managerName,
      managerEmail: draft.managerEmail.toLowerCase(),
      managerAccountId: managerAccountId || undefined,
    },
  };
}
