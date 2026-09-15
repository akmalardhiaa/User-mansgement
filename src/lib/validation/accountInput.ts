import { isRole, type Role } from "@/lib/auth/types";

/**
 * Hand-rolled validation for the account forms, matching the style of
 * userInput.ts: per-field errors the form can render inline, in the same
 * language as the rest of the UI.
 *
 * Every one of these runs on the server even though the forms check the same
 * rules in the browser. Client-side validation is a convenience for the person
 * typing; it is not a control, because anyone can post straight to the route.
 */

export type FieldErrors<T extends string> = Partial<Record<T, string>>;

export type Parsed<TValue, TField extends string> =
  | { ok: true; value: TValue }
  | { ok: false; errors: FieldErrors<TField> };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The floor named in the spec: short enough to type, long enough to resist guessing. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * bcrypt hashes at most 72 bytes and silently ignores the rest. Accepting a
 * longer password would mean two different passwords sharing a 72-byte prefix
 * both unlock the account, so it is rejected rather than quietly truncated.
 */
export const PASSWORD_MAX_BYTES = 72;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Passwords are never trimmed: a leading or trailing space is a real character. */
function asPassword(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function checkEmail(value: string): string | undefined {
  if (!value) return "Email wajib diisi.";
  if (value.length > 200) return "Email maksimal 200 karakter.";
  if (!EMAIL_PATTERN.test(value)) return "Masukkan alamat email yang valid.";
  return undefined;
}

function checkPassword(value: string): string | undefined {
  if (!value) return "Kata sandi wajib diisi.";
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`;
  }
  if (new TextEncoder().encode(value).length > PASSWORD_MAX_BYTES) {
    return `Kata sandi maksimal ${PASSWORD_MAX_BYTES} karakter.`;
  }
  return undefined;
}

function checkFullName(value: string): string | undefined {
  if (!value) return "Nama lengkap wajib diisi.";
  if (value.length < 2) return "Nama lengkap minimal 2 karakter.";
  if (value.length > 160) return "Nama lengkap maksimal 160 karakter.";
  return undefined;
}

function checkToken(value: string): string | undefined {
  if (!value) return "Token wajib diisi.";
  // Tokens are 32 random bytes rendered as hex. Anything else cannot match one,
  // so it is rejected here rather than turned into a database lookup.
  if (!/^[a-f0-9]{64}$/i.test(value)) return "Token tidak valid.";
  return undefined;
}

/** Drops keys whose check returned undefined, so `errors` only holds real problems. */
function stripUndefined<T extends string>(errors: FieldErrors<T>): FieldErrors<T> {
  const out: FieldErrors<T> = {};
  for (const [key, message] of Object.entries(errors)) {
    if (message) out[key as T] = message as FieldErrors<T>[T];
  }
  return out;
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
}

export type RegisterField = "email" | "password" | "confirmPassword" | "fullName";

export function parseRegisterInput(payload: unknown): Parsed<RegisterInput, RegisterField> {
  const body = (payload ?? {}) as Record<string, unknown>;
  const errors: FieldErrors<RegisterField> = {};

  const email = asString(body.email).toLowerCase();
  const password = asPassword(body.password);
  const fullName = asString(body.fullName);

  errors.email = checkEmail(email);
  errors.password = checkPassword(password);
  errors.fullName = checkFullName(fullName);

  // Only checked when the client sends it, so the route stays usable from curl
  // without repeating the field the form uses to catch typos.
  if (body.confirmPassword !== undefined && asPassword(body.confirmPassword) !== password) {
    errors.confirmPassword = "Konfirmasi kata sandi tidak cocok.";
  }

  const cleaned = stripUndefined(errors);
  if (Object.keys(cleaned).length > 0) return { ok: false, errors: cleaned };

  return { ok: true, value: { email, password, fullName } };
}

export interface LoginInput {
  email: string;
  password: string;
}

export type LoginField = "email" | "password";

export function parseLoginInput(payload: unknown): Parsed<LoginInput, LoginField> {
  const body = (payload ?? {}) as Record<string, unknown>;
  const errors: FieldErrors<LoginField> = {};

  const email = asString(body.email).toLowerCase();
  const password = asPassword(body.password);

  if (!email) errors.email = "Email wajib diisi.";
  if (!password) errors.password = "Kata sandi wajib diisi.";

  // Deliberately no length or strength check here: telling a caller their
  // password is too short to be correct narrows the search space for them.

  const cleaned = stripUndefined(errors);
  if (Object.keys(cleaned).length > 0) return { ok: false, errors: cleaned };

  return { ok: true, value: { email, password } };
}

export function parseTokenInput(payload: unknown): Parsed<{ token: string }, "token"> {
  const token = asString((payload as Record<string, unknown>)?.token);
  const error = checkToken(token);
  if (error) return { ok: false, errors: { token: error } };
  return { ok: true, value: { token } };
}

export function parseEmailInput(payload: unknown): Parsed<{ email: string }, "email"> {
  const email = asString((payload as Record<string, unknown>)?.email).toLowerCase();
  const error = checkEmail(email);
  if (error) return { ok: false, errors: { email: error } };
  return { ok: true, value: { email } };
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

export type ResetPasswordField = "token" | "password" | "confirmPassword";

export function parseResetPasswordInput(
  payload: unknown,
): Parsed<ResetPasswordInput, ResetPasswordField> {
  const body = (payload ?? {}) as Record<string, unknown>;
  const errors: FieldErrors<ResetPasswordField> = {};

  const token = asString(body.token);
  const password = asPassword(body.password);

  errors.token = checkToken(token);
  errors.password = checkPassword(password);

  if (body.confirmPassword !== undefined && asPassword(body.confirmPassword) !== password) {
    errors.confirmPassword = "Konfirmasi kata sandi tidak cocok.";
  }

  const cleaned = stripUndefined(errors);
  if (Object.keys(cleaned).length > 0) return { ok: false, errors: cleaned };

  return { ok: true, value: { token, password } };
}

export interface UpdateUserInput {
  fullName?: string;
  email?: string;
  role?: Role;
  password?: string;
}

export type UpdateUserField = "fullName" | "email" | "role" | "password";

/**
 * A partial update: only the keys present in the body are validated and
 * returned, so a caller sending just `{ fullName }` cannot accidentally blank
 * the fields it left out.
 */
export function parseUpdateUserInput(payload: unknown): Parsed<UpdateUserInput, UpdateUserField> {
  const body = (payload ?? {}) as Record<string, unknown>;
  const errors: FieldErrors<UpdateUserField> = {};
  const value: UpdateUserInput = {};

  if (body.fullName !== undefined) {
    const fullName = asString(body.fullName);
    errors.fullName = checkFullName(fullName);
    value.fullName = fullName;
  }

  if (body.email !== undefined) {
    const email = asString(body.email).toLowerCase();
    errors.email = checkEmail(email);
    value.email = email;
  }

  if (body.password !== undefined) {
    const password = asPassword(body.password);
    errors.password = checkPassword(password);
    value.password = password;
  }

  if (body.role !== undefined) {
    if (!isRole(body.role)) errors.role = "Peran harus USER atau ADMIN.";
    else value.role = body.role;
  }

  const cleaned = stripUndefined(errors);
  if (Object.keys(cleaned).length > 0) return { ok: false, errors: cleaned };

  if (Object.keys(value).length === 0) {
    return { ok: false, errors: { fullName: "Tidak ada perubahan yang dikirim." } };
  }

  return { ok: true, value };
}

export interface CreateAccountInput {
  email: string;
  fullName: string;
  password: string;
  role: Role;
}

export type CreateAccountField = "email" | "fullName" | "password" | "role";

/** Admin-created accounts: active immediately, role defaults to USER. */
export function parseCreateAccountInput(
  payload: unknown,
): Parsed<CreateAccountInput, CreateAccountField> {
  const body = (payload ?? {}) as Record<string, unknown>;
  const email = asString(body.email).toLowerCase();
  const fullName = asString(body.fullName);
  const password = asPassword(body.password);
  const role = body.role === undefined || body.role === "" ? "USER" : body.role;

  const errors = stripUndefined<CreateAccountField>({
    email: checkEmail(email),
    fullName: checkFullName(fullName),
    password: checkPassword(password),
    role: isRole(role) ? undefined : "Peran harus USER atau ADMIN.",
  });
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return { ok: true, value: { email, fullName, password, role: role as Role } };
}
