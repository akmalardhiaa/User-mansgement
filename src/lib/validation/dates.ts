/**
 * What a sensible date is, for every date a form asks for.
 *
 * A date input lets a year run to six digits, and `Date.parse` happily accepts
 * `132144-12-13`. Requests went through with an effective date in year 132144 —
 * scheduled, approved by both approvers, and then never executed, because the
 * worker waits for the effective date. Nothing looked wrong; the employee just
 * never appeared. So a date must be a real calendar date with a four-digit
 * year, inside a window that makes sense for what it means.
 *
 * Pure and shared: the server validates with it, and the forms use the same
 * bounds for their date pickers, so the two cannot disagree.
 */

export interface DateBounds {
  /** How far before today the date may be. */
  pastDays: number;
  /** How far after today the date may be. */
  futureDays: number;
}

export const DATE_BOUNDS = {
  /** When an approved change runs. A year out is already a long plan. */
  effectiveAt: { pastDays: 30, futureDays: 365 },
  /** A first day at work, possibly recorded late. */
  startDate: { pastDays: 365, futureDays: 365 },
  /** A last day at work, possibly recorded late. */
  lastWorkingDate: { pastDays: 365, futureDays: 365 },
  /** A new hire's contract end. */
  newContractEnd: { pastDays: 30, futureDays: 3650 },
  /** An existing contract's end, which may already have passed. */
  contractEnd: { pastDays: 3650, futureDays: 3650 },
} satisfies Record<string, DateBounds>;

const DAY_MS = 86_400_000;
const SHAPE = /^(\d{4})-(\d{2})-(\d{2})(?:T.+)?$/;

/** A calendar day as a moment: 00:00 in the company's timezone. */
function moment(value: string): number {
  return value.length === 10 ? Date.parse(`${value}T00:00:00.000+07:00`) : Date.parse(value);
}

/** yyyy-MM-dd in Asia/Jakarta, which is what date inputs and the server speak. */
export function jakartaDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(at);
}

function readable(at: Date): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(at);
}

export type DateCheck = { ok: true } | { ok: false; message: string };

export function checkDate(value: string, label: string, bounds: DateBounds, now = new Date()): DateCheck {
  const shape = SHAPE.exec(value);
  const at = moment(value);
  if (!shape || Number.isNaN(at)) {
    return { ok: false, message: `${label} tidak valid. Gunakan tanggal dengan tahun 4 digit.` };
  }

  // A day that does not exist — 31 February — must not roll over into March.
  const [, year, month, day] = shape;
  const probe = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (probe.getUTCMonth() !== Number(month) - 1 || probe.getUTCDate() !== Number(day)) {
    return { ok: false, message: `${label} tidak valid: tanggal itu tidak ada di kalender.` };
  }

  const earliest = new Date(moment(jakartaDay(now)) - bounds.pastDays * DAY_MS);
  const latest = new Date(moment(jakartaDay(now)) + (bounds.futureDays + 1) * DAY_MS - 1);

  if (at < earliest.getTime()) {
    return { ok: false, message: `${label} terlalu jauh ke belakang — paling awal ${readable(earliest)}.` };
  }
  if (at > latest.getTime()) {
    return {
      ok: false,
      message: `${label} terlalu jauh ke depan — paling lambat ${readable(latest)}. Periksa angka tahunnya.`,
    };
  }
  return { ok: true };
}

/** `min` and `max` for an <input type="date">, from the same bounds. */
export function dateInputBounds(bounds: DateBounds, now = new Date()): { min: string; max: string } {
  const today = moment(jakartaDay(now));
  return {
    min: jakartaDay(new Date(today - bounds.pastDays * DAY_MS)),
    max: jakartaDay(new Date(today + bounds.futureDays * DAY_MS)),
  };
}

/**
 * A calendar day as the moment it starts in Jakarta, written with its offset.
 *
 * A bare `yyyy-MM-dd` is read by `Date.parse` as midnight UTC — 07:00 in
 * Jakarta — so a change "effective 22 September" stayed scheduled until seven
 * in the morning. Kept as a string with `+07:00` rather than converted to UTC,
 * so the calendar day in it is still the one HC picked.
 */
export function startOfJakartaDay(value: string): string {
  return value.length === 10 ? `${value}T00:00:00+07:00` : value;
}

/**
 * The day after a yyyy-MM-dd date, as the same kind of string.
 *
 * Used for the one place a date means "the day this stops": a termination
 * names somebody's last working day, and the account has to keep working
 * through it. Disabling at the start of that day would take the account away
 * on the morning of the day they were told they still had.
 *
 * Computed on the date parts rather than by adding milliseconds, so it is the
 * next calendar day in Jakarta regardless of where the server thinks it is.
 */
export function nextJakartaDay(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;

  // Month is zero-based going in, and Date rolls a 32nd of the month over for
  // us — including across a year, and including February in a leap year.
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}
