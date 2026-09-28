/**
 * Which language the portal is speaking, and where that choice is kept.
 *
 * The choice lives in a cookie rather than in the URL, and that is deliberate.
 * Next's guide routes locales as a path segment (`/en/pengajuan`), which means
 * every path gains a prefix — including `/persetujuan/<token>`, the link
 * already sitting in approvers' inboxes. Those links must keep working exactly
 * as sent, and an approver is not a portal user with a language preference
 * anyway: their email decides its own language. A cookie changes what is
 * rendered without changing a single address.
 *
 * The trade-off is real and worth naming: a URL cannot be shared "in English",
 * and two people on one machine share one preference. Neither costs anything
 * here, where the portal has one audience on one desk.
 */

export const LOCALES = ["id", "en"] as const;

export type Locale = (typeof LOCALES)[number];

/** Indonesian: this is an Indonesian company's internal portal. */
export const DEFAULT_LOCALE: Locale = "id";

export const LOCALE_COOKIE = "hc_lang";

/** A year: a language preference is not something to ask about again next week. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Anything unrecognised — absent, stale, hand-edited — falls back to the default. */
export function parseLocale(value: string | undefined | null): Locale {
  return LOCALES.includes(value as Locale) ? (value as Locale) : DEFAULT_LOCALE;
}

export const LOCALE_LABEL: Record<Locale, string> = {
  id: "Bahasa Indonesia",
  en: "English",
};

/** What the switch shows: short enough for a header button. */
export const LOCALE_SHORT: Record<Locale, string> = {
  id: "ID",
  en: "EN",
};
