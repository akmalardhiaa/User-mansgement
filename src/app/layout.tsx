import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth/session";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: "HC User Management",
  description:
    "Portal Human Capital untuk pengelolaan akun karyawan dengan alur persetujuan melalui Jira.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Read once here so the chrome knows who is signed in; middleware is what
  // actually enforces access.
  const store = await cookies();
  const session = await readSessionToken(store.get(SESSION_COOKIE)?.value);

  return (
    <html lang="id" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Sets data-theme before the first paint. Anything later — an effect, a
            provider — means every load flashes the wrong palette first. The
            attribute it writes is why <html> suppresses hydration warnings:
            the server cannot know which theme this browser chose. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        {/* Motion config outermost, so every animation below it — including the
            toasts, which sit outside the shell — honours "reduce motion". */}
        <MotionProvider>
          <ToastProvider>
            <AppShell user={session ? { name: session.name, email: session.email } : undefined}>
              {children}
            </AppShell>
          </ToastProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
