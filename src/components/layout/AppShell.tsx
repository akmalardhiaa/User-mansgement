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

/** Top-level chrome: brand, primary navigation, and the page container. */
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
        <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-5 py-3.5">
          <Link href={user ? "/" : "/login"} className="flex items-center">
            <BrandMark />
          </Link>

          {showNav ? (
            <nav className="flex items-center gap-1" aria-label="Navigasi utama">
              {(IS_STATIC_DEMO ? [] : NAV).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    isActive(pathname, item.href)
                      ? "bg-elevated text-ink"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}

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

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">{children}</main>

      <footer className="border-t border-hairline px-5 py-5 text-center text-xs text-ink-faint">
        Human Capital · pengajuan akun diproses melalui persetujuan di Jira
      </footer>
    </div>
  );
}
