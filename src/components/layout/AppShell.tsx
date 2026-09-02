"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { BrandMark } from "@/components/ui/BrandMark";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/requests", label: "Persetujuan" },
  { href: "/users/new", label: "Tambah akun" },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * The static GitHub Pages build exports a single page, so the multi-route nav
 * would only produce dead links. Inlined at build time.
 */
const IS_STATIC_DEMO = process.env.NEXT_PUBLIC_DEMO === "true";

export interface SessionUser {
  name: string;
  email: string;
}

/**
 * Top-level chrome: a header carrying the brand and the session, primary
 * navigation down the left, and the page container beside it. The nav folds
 * back to a scrolling row above the content on narrow screens, where a
 * fixed-width rail would cost more than it earns.
 */
export function AppShell({ children, user }: { children: ReactNode; user?: SessionUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  // Signed out (the login screen) gets the container without the navigation,
  // which would only be dead links there.
  const showNav = Boolean(user) || IS_STATIC_DEMO;

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-hairline bg-canvas/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-6 px-5 py-3.5">
          <Link href={user ? "/" : "/login"} className="flex items-center">
            <BrandMark />
          </Link>

          <div className="ml-auto flex items-center gap-4 text-xs text-ink-faint">
            {IS_STATIC_DEMO ? (
              <span className="hidden items-center gap-2 sm:flex">
                <span className="size-1.5 rounded-full bg-warn" aria-hidden />
                Preview statis · Jira tidak terhubung
              </span>
            ) : user ? (
              <>
                <span className="hidden text-right sm:block">
                  <span className="block text-ink">{user.name}</span>
                  <span className="block">{user.email}</span>
                </span>
                <button
                  onClick={signOut}
                  disabled={signingOut}
                  className="rounded-lg border border-hairline px-3 py-1.5 text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink disabled:opacity-50"
                >
                  {signingOut ? "Keluar…" : "Keluar"}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-5 py-8 md:flex-row">
        {showNav ? (
          <aside className="shrink-0 md:w-44">
            {/* Sticky clears the header: 3.5rem of chrome plus the container's
                own top padding, so the first item lands where it started. */}
            <nav
              className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:sticky md:top-[4.5rem] md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0"
              aria-label="Navigasi utama"
            >
              {(IS_STATIC_DEMO ? [] : NAV).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors md:border-l-2 ${
                    isActive(pathname, item.href)
                      ? "bg-elevated text-ink md:border-accent"
                      : "text-ink-muted hover:bg-elevated/60 hover:text-ink md:border-transparent"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
        ) : null}

        {/* min-w-0 or a wide table stretches the row instead of scrolling. */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <footer className="border-t border-hairline px-5 py-5 text-center text-xs text-ink-faint">
        Human Capital · pengajuan akun diproses melalui persetujuan di Jira
      </footer>
    </div>
  );
}
