import { redirect } from "next/navigation";

import { LoginAside } from "@/components/auth/LoginAside";
import { LoginForm } from "@/components/auth/LoginForm";
import { Reveal } from "@/components/motion/Reveal";
import { BrandMark } from "@/components/ui/BrandMark";
import { Card } from "@/components/ui/Field";
import { IconAlert } from "@/components/ui/Icons";
import { isAuthConfigured, isDemoLoginEnabled, isLdapConfigured } from "@/lib/auth/ad";
import { getSession } from "@/lib/auth/current";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * The tab title follows the chosen language too. `generateMetadata` rather
 * than a static object, because the dictionary is only known per request.
 */
export async function generateMetadata() {
  const { t } = await getTranslations();
  return { title: t.login.metaTitle };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { t } = await getTranslations();
  const { next } = await searchParams;
  /*
   * Only same-site paths, so `?next=` can never bounce someone to another host.
   *
   * `/login` is excluded as well, and not for tidiness: sending a signed-in
   * visitor back to this page would redirect it to itself without end — the
   * same loop this file's redirect exists to have fixed.
   */
  const destination =
    next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login")
      ? next
      : "/";

  /*
   * Somebody already signed in has no reason to see the form.
   *
   * Decided here rather than in proxy.ts because this is the layer that can
   * resolve a session. The proxy sees only that a cookie exists, and acting on
   * that alone locked out anyone holding a stale one.
   */
  if (await getSession()) redirect(destination);
  const configured = isAuthConfigured();
  // No LDAP server wired up yet: the app is running on its local demo accounts.
  const demoMode = !isLdapConfigured() && isDemoLoginEnabled();

  return (
    // `content-center` rather than `flex-1`: the shell's <main> is not a flex
    // container, so the grid has to centre itself against its own min-height.
    <div className="mx-auto grid w-full max-w-4xl min-h-[68vh] content-center items-center gap-8 lg:grid-cols-2">
      <Reveal delay={0.06}>
        <LoginAside />
      </Reveal>

      <Reveal className="mx-auto w-full max-w-md">
        <div className="mb-6 lg:hidden">
          <BrandMark size="lg" />
        </div>

        <div className="mb-6 space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface/80 px-3 py-1 text-xs text-ink-muted backdrop-blur-sm">
            <span className="size-1.5 rounded-full bg-accent animate-pulse" />
            <span className="font-semibold text-shimmer-brand">User Management</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">{t.login.title}</h1>
          <p className="text-sm text-ink-muted">{t.login.subtitle}</p>
        </div>

        <Card className="relative overflow-hidden p-6 sm:p-7 bg-surface/95 border-hairline-strong/70 shadow-[0_12px_40px_-15px_rgba(7,19,33,0.6)]">
          {/* Subtle accent sheen line on top of card */}
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent opacity-80" />

          {configured ? (
            <>
              <LoginForm next={destination} />
              {/* Accounts live in Active Directory: no sign-up, and passwords are
                  reset through AD, not here. */}
              {demoMode ? (
                <div className="mt-5 space-y-1 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
                  <p className="flex items-center gap-2 font-medium text-warn">
                    <IconAlert className="size-4" />
                    {t.login.demoTitle}
                  </p>
                  <p className="text-ink-muted">{t.login.demoBody}</p>
                  <p className="text-ink-muted">{t.login.demoEnvHint}</p>
                </div>
              ) : (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4 text-sm">
                  <span className="text-ink-muted">{t.login.withAd}</span>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm">
              <p className="flex items-center gap-2 font-medium text-warn">
                <IconAlert className="size-4" />
                {t.login.notConfiguredTitle}
              </p>
              <p className="mt-2 text-ink-muted">{t.login.notConfiguredBody}</p>
            </div>
          )}
        </Card>
      </Reveal>
    </div>
  );
}
