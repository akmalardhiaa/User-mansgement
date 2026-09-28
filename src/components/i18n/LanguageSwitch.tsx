"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { useI18n } from "@/components/i18n/LocaleProvider";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALE_SHORT } from "@/lib/i18n/locale";

/**
 * Two languages, one button: it shows the one you are not reading.
 *
 * The cookie is written here rather than through an endpoint. It carries a
 * display preference, nothing authenticating, so it is readable by the page on
 * purpose — and `router.refresh()` then re-renders the server components with
 * the new language without a full reload and without losing the page you are
 * on. `SameSite=Lax` keeps it off cross-site requests; there is no `Secure`
 * because the demo runs over plain http on localhost, and a cookie the browser
 * refuses to send would simply never switch anything.
 */
export function LanguageSwitch() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const next = locale === "id" ? "en" : "id";

  function switchLanguage() {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      onClick={switchLanguage}
      disabled={pending}
      title={t.language.switchTo}
      aria-label={t.language.switchTo}
      className="rounded-lg border border-hairline px-2 py-1.5 text-[11px] font-semibold tracking-wide text-ink-muted transition-colors hover:border-accent/50 hover:text-ink disabled:opacity-60"
    >
      {LOCALE_SHORT[next]}
    </button>
  );
}
