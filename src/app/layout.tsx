import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { AppShell } from "@/components/layout/AppShell";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { getSession } from "@/lib/auth/current";
import { getTranslations } from "@/lib/i18n/server";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: "HC User Management",
  description: "Portal Human Capital: direktori karyawan dengan login Active Directory.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Read once here so the chrome knows who is signed in and which nav items to
  // offer. Each page still guards itself: this only decides what to draw.
  const session = await getSession();

  // Read once per request and handed to both sides: server components take the
  // dictionary as a value, client components through the provider below.
  const { locale, t } = await getTranslations();

  /*
   * The per-request nonce, set by the proxy.
   *
   * Next attaches this to its own script tags automatically, but the boot
   * script below is a plain <script> rather than a <Script> component, so it
   * needs the nonce spelled out — otherwise the policy blocks the one script
   * whose whole job is to run before the first paint.
   */
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang={locale} className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Sets data-theme before the first paint. Anything later — an effect, a
            provider — means every load flashes the wrong palette first. The
            attribute it writes is why <html> suppresses hydration warnings:
            the server cannot know which theme this browser chose. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        {/* Motion config outermost, so every animation below it — including the
            toasts, which sit outside the shell — honours "reduce motion". */}
        <MotionProvider>
          <LocaleProvider locale={locale} dictionary={t}>
            <ToastProvider>
              <AppShell
                user={
                  session
                    ? { name: session.fullName, email: session.email, roles: session.roles }
                    : undefined
                }
              >
                {children}
              </AppShell>
            </ToastProvider>
          </LocaleProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
