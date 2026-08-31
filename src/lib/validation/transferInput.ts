import type { TransferInput } from "@/lib/types";

/** Validation for `POST /api/users/:id/transfer`. */

export type TransferFieldErrors = Partial<Record<keyof TransferInput, string>>;

export type TransferValidation =
  | { ok: true; value: TransferInput }
  | { ok: false; errors: TransferFieldErrors };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseTransferInput(payload: unknown): TransferValidation {
  const body = (payload ?? {}) as Record<string, unknown>;
  const errors: TransferFieldErrors = {};

  const department = asString(body.department);
  const jobTitle = asString(body.jobTitle);
  const managerName = asString(body.managerName);
  const managerEmail = asString(body.managerEmail);

  if (!department) errors.department = "Divisi tujuan wajib diisi.";
  if (!jobTitle) errors.jobTitle = "Posisi baru wajib diisi.";

  // The new manager is optional, but half of one is not usable: assigning the
  // approval needs an email, and the audit trail needs a name.
  if (managerEmail && !EMAIL_PATTERN.test(managerEmail)) {
    errors.managerEmail = "Masukkan alamat email manager baru yang valid.";
  }
  if (managerEmail && !managerName) {
    errors.managerName = "Isi juga nama manager baru.";
  }
  if (managerName && !managerEmail) {
    errors.managerEmail = "Isi juga email manager baru.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      department,
      jobTitle,
      managerName: managerName || undefined,
      managerEmail: managerEmail ? managerEmail.toLowerCase() : undefined,
      reason: asString(body.reason) || undefined,
    },
  };
}
