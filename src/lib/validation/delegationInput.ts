/**
 * Validation for registering a delegation, in the shape the other forms use:
 * per-field errors in the language of the UI.
 *
 * Only the shape is checked here. Whether the people exist, whether the dates
 * collide with another delegation, whether it would form a chain — those need
 * the store, and are decided by the delegation service.
 */

export interface DelegationInput {
  fromEmail: string;
  toEmail: string;
  /** yyyy-MM-dd, Asia/Jakarta. */
  startDate: string;
  endDate: string;
  reason: string;
  /** Also move requests already waiting on this manager. */
  reroutePending: boolean;
}

export type DelegationInputResult =
  | { ok: true; value: DelegationInput }
  | { ok: false; errors: Record<string, string> };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseDelegationInput(payload: unknown): DelegationInputResult {
  const body = (payload ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const fromEmail = text(body.fromEmail).toLowerCase();
  if (!EMAIL_PATTERN.test(fromEmail)) errors.fromEmail = "Pilih manager yang berhalangan.";

  const toEmail = text(body.toEmail).toLowerCase();
  if (!EMAIL_PATTERN.test(toEmail)) errors.toEmail = "Pilih pengganti.";

  const startDate = text(body.startDate);
  if (!DATE_PATTERN.test(startDate) || Number.isNaN(Date.parse(startDate))) {
    errors.startDate = "Tanggal mulai wajib diisi.";
  }

  const endDate = text(body.endDate);
  if (!DATE_PATTERN.test(endDate) || Number.isNaN(Date.parse(endDate))) {
    errors.endDate = "Tanggal selesai wajib diisi.";
  }

  const reason = text(body.reason);
  if (reason.length < 3) errors.reason = "Alasan wajib diisi, misalnya \"cuti tahunan\".";
  else if (reason.length > 500) errors.reason = "Alasan maksimal 500 karakter.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: { fromEmail, toEmail, startDate, endDate, reason, reroutePending: body.reroutePending === true },
  };
}
