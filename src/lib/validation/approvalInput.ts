import { isDepartment } from "@/lib/config/approvalEnv";

import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  type FieldErrors,
  type Parsed,
} from "./accountInput";

/**
 * Validation for the approval workflow.
 *
 * Runs on the server for every request, whatever the form already checked:
 * the form is a convenience for the person typing, not a control.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function email(value: unknown): string {
  return text(value).toLowerCase();
}

function checkEmail(value: string, label: string): string | undefined {
  if (!value) return `${label} wajib diisi.`;
  if (value.length > 200) return `${label} maksimal 200 karakter.`;
  if (!EMAIL_PATTERN.test(value)) return `${label} tidak valid.`;
  return undefined;
}

function checkName(value: string, label: string): string | undefined {
  if (!value) return `${label} wajib diisi.`;
  if (value.length < 2) return `${label} minimal 2 karakter.`;
  if (value.length > 120) return `${label} maksimal 120 karakter.`;
  return undefined;
}

/** Length plus a letter and a digit: short of a policy, long enough to stop "password". */
export function checkPasswordStrength(value: string): string | undefined {
  if (!value) return "Kata sandi wajib diisi.";
  if (value.length < PASSWORD_MIN_LENGTH) return `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`;
  if (new TextEncoder().encode(value).length > PASSWORD_MAX_BYTES) {
    return `Kata sandi maksimal ${PASSWORD_MAX_BYTES} karakter.`;
  }
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return "Kata sandi harus mengandung huruf dan angka.";
  }
  return undefined;
}

function clean<T extends string>(errors: FieldErrors<T>): FieldErrors<T> {
  const out: FieldErrors<T> = {};
  for (const [key, message] of Object.entries(errors)) {
    if (message) out[key as T] = message as FieldErrors<T>[T];
  }
  return out;
}

export interface RegisterWithApprovalInput {
  email: string;
  fullName: string;
  password: string;
  department: string;
  managerEmail: string;
  managerName: string;
  cisoEmail: string;
  cisoName: string;
  notes?: string;
}

export type RegisterWithApprovalField =
  | keyof RegisterWithApprovalInput
  | "confirmPassword";

export function parseRegisterWithApprovalInput(
  payload: unknown,
): Parsed<RegisterWithApprovalInput, RegisterWithApprovalField> {
  const body = (payload ?? {}) as Record<string, unknown>;
  const password = typeof body.password === "string" ? body.password : "";

  const value: RegisterWithApprovalInput = {
    email: email(body.email),
    fullName: text(body.fullName),
    password,
    department: text(body.department),
    managerEmail: email(body.managerEmail),
    managerName: text(body.managerName),
    cisoEmail: email(body.cisoEmail),
    cisoName: text(body.cisoName),
    notes: text(body.notes) || undefined,
  };

  const errors: FieldErrors<RegisterWithApprovalField> = {
    email: checkEmail(value.email, "Email"),
    fullName: checkName(value.fullName, "Nama lengkap"),
    password: checkPasswordStrength(password),
    department: isDepartment(value.department) ? undefined : "Pilih departemen dari daftar.",
    managerEmail: checkEmail(value.managerEmail, "Email manager"),
    managerName: checkName(value.managerName, "Nama manager"),
    cisoEmail: checkEmail(value.cisoEmail, "Email CISO"),
    cisoName: checkName(value.cisoName, "Nama CISO"),
    notes: value.notes && value.notes.length > 1000 ? "Keterangan maksimal 1000 karakter." : undefined,
  };

  if (body.confirmPassword !== undefined && body.confirmPassword !== password) {
    errors.confirmPassword = "Konfirmasi kata sandi tidak cocok.";
  }

  // Two-person rule. The approvers are typed into the form, so without these
  // checks one person could approve their own account, or both steps alone.
  if (!errors.managerEmail && value.managerEmail === value.email) {
    errors.managerEmail = "Manager tidak boleh sama dengan user yang diajukan.";
  }
  if (!errors.cisoEmail && value.cisoEmail === value.email) {
    errors.cisoEmail = "CISO tidak boleh sama dengan user yang diajukan.";
  }
  if (!errors.cisoEmail && !errors.managerEmail && value.cisoEmail === value.managerEmail) {
    errors.cisoEmail = "CISO dan manager harus orang yang berbeda.";
  }

  const cleaned = clean(errors);
  if (Object.keys(cleaned).length > 0) return { ok: false, errors: cleaned };
  return { ok: true, value };
}

export type ApprovingRole = "manager" | "it_security";

export function isApprovingRole(value: unknown): value is ApprovingRole {
  return value === "manager" || value === "it_security";
}

export interface DecisionInput {
  token: string;
  approvingRole: ApprovingRole;
  reason?: string;
}

export type DecisionField = keyof DecisionInput;

export function parseDecisionInput(
  payload: unknown,
  requireReason: boolean,
): Parsed<DecisionInput, DecisionField> {
  const body = (payload ?? {}) as Record<string, unknown>;
  const token = text(body.token);
  const reason = text(body.reason);

  const errors: FieldErrors<DecisionField> = {
    token: token ? undefined : "Token wajib diisi.",
    approvingRole: isApprovingRole(body.approvingRole)
      ? undefined
      : 'approvingRole harus "manager" atau "it_security".',
    reason: !requireReason
      ? undefined
      : reason.length < 5
        ? "Tuliskan alasan penolakan (minimal 5 karakter)."
        : reason.length > 1000
          ? "Alasan maksimal 1000 karakter."
          : undefined,
  };

  const cleaned = clean(errors);
  if (Object.keys(cleaned).length > 0) return { ok: false, errors: cleaned };

  return {
    ok: true,
    value: {
      token,
      approvingRole: body.approvingRole as ApprovingRole,
      reason: requireReason ? reason : undefined,
    },
  };
}
