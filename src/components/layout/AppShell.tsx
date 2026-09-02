"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ComponentType, type ReactNode } from "react";

import { BrandMark } from "@/components/ui/BrandMark";
import {
  IconApprovals,
  IconDirectory,
  IconSignOut,
  IconUserPlus,
} from "@/components/ui/Icons";
import { TRANSITION, TRANSITION_LAYOUT } from "@/lib/motion";

const NAV: ReadonlyArray<{
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { href: "/", label: "Dashboard", icon: IconDirectory },
  { href: "/requests", label: "Persetujuan", icon: IconApprovals },
  { href: "/users/new", label: "Tambah akun", icon: IconUserPlus },
];

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

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
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
  const [scrolled, setScrolled] = useState(false);

  const { scrollY } = useScroll();
  // The header only earns its shadow once there is something underneath it to
  // cast onto. A subscription rather than a scroll listener in an effect, so
  // this never triggers a React render per frame.
  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 8);
  });

  // The demo build has no routes to link to, so it gets the container without
  // navigation — as does the login screen, where every item would be a dead end.
  const items = IS_STATIC_DEMO ? [] : user ? NAV : [];

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header
        className={`sticky top-0 z-30 border-b bg-canvas/80 backdrop-blur-md transition-[border-color,box-shadow] duration-300 ${
          scrolled
            ? "border-hairline-strong shadow-[0_8px_30px_-12px_rgba(0,0,0,0.7)]"
            : "border-hairline shadow-none"
        }`}
      >
        <div className="mx-auto flex w-full max-w-7xl items-center gap-6 px-5 py-3.5">
          <Link
            href={user ? "/" : "/login"}
            className="flex items-center rounded-lg transition-opacity hover:opacity-80"
          >
            <BrandMark />
          </Link>

          <div className="ml-auto flex items-center gap-3 text-xs text-ink-faint">
            {IS_STATIC_DEMO ? (
              <span className="hidden items-center gap-2 sm:flex">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-warn opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-warn" />
                </span>
                Preview statis · Jira tidak terhubung
              </span>
            ) : user ? (
              <>
                <span className="hidden items-center gap-2.5 sm:flex">
                  <span
                    className="grid size-8 place-items-center rounded-full border border-accent/30 bg-accent/10 text-[11px] font-semibold text-accent-soft"
                    aria-hidden
                  >
                    {initials(user.name)}
                  </span>
                  <span className="text-right leading-tight">
                    <span className="block text-ink">{user.name}</span>
                    <span className="block">{user.email}</span>
                  </span>
                </span>
                <button
                  onClick={signOut}
                  disabled={signingOut}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-ink-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
                >
                  <IconSignOut className="size-3.5" />
                  {signingOut ? "Keluar…" : "Keluar"}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-5 py-8 md:flex-row">
        {items.length > 0 ? (
          <aside className="shrink-0 md:w-48">
            {/* Sticky clears the header: 3.5rem of chrome plus the container's
                own top padding, so the first item lands where it started. */}
            <nav
              className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:sticky md:top-[4.5rem] md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0"
              aria-label="Navigasi utama"
            >
              {items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors duration-200 ${
                      active ? "text-ink" : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {/* One element shared across the items: Framer moves it from
                        the old item to the new one instead of cross-fading two
                        backgrounds, so the highlight travels the rail. */}
                    {active ? (
                      <motion.span
                        layoutId="nav-active"
                        transition={TRANSITION_LAYOUT}
                        className="absolute inset-0 rounded-lg border border-hairline-strong bg-elevated"
                      />
                    ) : (
                      <span className="absolute inset-0 rounded-lg bg-elevated/0 transition-colors duration-200 group-hover:bg-elevated/50" />
                    )}
                    <item.icon
                      className={`relative size-4 transition-colors duration-200 ${
                        active ? "text-accent" : "text-ink-faint group-hover:text-ink-muted"
                      }`}
                    />
                    <span className="relative">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        ) : null}

        {/* min-w-0 or a wide table stretches the row instead of scrolling. */}
        <main className="min-w-0 flex-1">
          {/*
           * Keyed on the path, so navigating remounts the subtree and replays
           * the entrance. Only an entrance: the App Router unmounts the old
           * route the moment the new one is ready, so an exit animation would
           * have nothing left to play on.
           */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={TRANSITION}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <footer className="border-t border-hairline px-5 py-5 text-center text-xs text-ink-faint">
        Human Capital · pengajuan akun diproses melalui persetujuan di Jira
      </footer>
    </div>
  );
}
