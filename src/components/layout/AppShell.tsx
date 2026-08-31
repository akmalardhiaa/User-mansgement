"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/requests", label: "Approvals" },
  { href: "/users/new", label: "Add user" },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Top-level chrome: brand, primary navigation, and the page container. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-hairline bg-canvas/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-fuchsia-500 text-sm font-bold text-white">
              HC
            </span>
            <span className="text-sm font-semibold tracking-tight">User Management</span>
          </Link>

          <nav className="flex items-center gap-1" aria-label="Primary">
            {NAV.map((item) => (
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

          <div className="ml-auto hidden items-center gap-2 text-xs text-ink-faint sm:flex">
            <span className="size-1.5 rounded-full bg-ok" aria-hidden />
            Jira workflow connected
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">{children}</main>

      <footer className="border-t border-hairline px-5 py-5 text-center text-xs text-ink-faint">
        Human Capital · account requests are provisioned through Jira approvals
      </footer>
    </div>
  );
}
