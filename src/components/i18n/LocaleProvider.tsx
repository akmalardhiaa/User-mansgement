"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { Dictionary } from "@/lib/i18n/dictionaries/id";
import type { Locale } from "@/lib/i18n/locale";

/**
 * The words, for components that run in the browser.
 *
 * Server components read the dictionary directly (lib/i18n/server.ts). Client
 * components cannot — `cookies()` is not available to them — so the root layout
 * reads it once per request and hands it down through this context. One read,
 * one source, and no component fetching its own language.
 */

interface LocaleValue {
  locale: Locale;
  t: Dictionary;
}

const LocaleContext = createContext<LocaleValue | undefined>(undefined);

export function LocaleProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale;
  dictionary: Dictionary;
  children: ReactNode;
}) {
  return (
    <LocaleContext.Provider value={{ locale, t: dictionary }}>{children}</LocaleContext.Provider>
  );
}

/**
 * Throws outside the provider rather than falling back to Indonesian: a
 * silently untranslated component is exactly the failure this is meant to
 * prevent, and it would only be noticed by whoever is reading the screen.
 */
export function useI18n(): LocaleValue {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error("useI18n dipakai di luar LocaleProvider — bungkus di layout root.");
  }
  return value;
}

/** The common case: just the words. */
export function useT(): Dictionary {
  return useI18n().t;
}
