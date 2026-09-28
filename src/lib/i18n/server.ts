import { cookies } from "next/headers";

import { en } from "./dictionaries/en";
import { id, type Dictionary } from "./dictionaries/id";
import { parseLocale, LOCALE_COOKIE, type Locale } from "./locale";

/**
 * The language for this request, and the words that go with it. Server side:
 * `cookies()` makes that inherent, so this file needs no `server-only` marker
 * (and the package is not a dependency here).
 *
 * Both dictionaries are imported outright rather than loaded on demand. They
 * are two objects of strings in a portal with one audience; a dynamic import
 * would buy a few kilobytes and cost the guarantee that a missing translation
 * is a typecheck error rather than a runtime one.
 */

const DICTIONARIES: Record<Locale, Dictionary> = { id, en };

/** Whatever the language switch last wrote, or Indonesian. */
export async function getLocale(): Promise<Locale> {
  return parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}

export function dictionaryFor(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

/** The usual pair: what language, and the words. */
export async function getTranslations(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await getLocale();
  return { locale, t: DICTIONARIES[locale] };
}
