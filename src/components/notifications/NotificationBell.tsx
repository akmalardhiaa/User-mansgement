"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { IconAlert, IconBell, IconCheck, IconClock, IconExternal, IconInbox } from "@/components/ui/Icons";
import { TRANSITION_FAST } from "@/lib/motion";
import { unreadSince, type Feed, type FeedItem } from "@/lib/notifications/feed";

/**
 * The bell, its unread count, and the panel behind it.
 *
 * Jira moves these requests, not this app, so the feed is polled rather than
 * pushed — a webhook lands on the server and the browser has no way to know.
 * Sixty seconds is slow enough to be invisible on the network tab and fast
 * enough that an approval is never stale by the time anyone looks.
 */
const POLL_MS = 60_000;

/** Where the last-opened mark lives. Per browser, which is what "seen" means. */
const SEEN_KEY = "hc:notifications:seen";

function readSeen(): string | null {
  try {
    return window.localStorage.getItem(SEEN_KEY);
  } catch {
    // Private windows and blocked site data both throw here. Treating that as
    // "never opened" shows every item as new, which is noisier than the truth
    // but never hides something that needs attention.
    return null;
  }
}

/**
 * localStorage is an external store, so it is read through
 * `useSyncExternalStore` rather than copied into state by an effect: there is
 * no first render where React's copy disagrees with what is on disk, and the
 * server snapshot is simply "never opened".
 */
const seenListeners = new Set<() => void>();

function subscribeSeen(onChange: () => void): () => void {
  seenListeners.add(onChange);
  return () => {
    seenListeners.delete(onChange);
  };
}

function markSeen(value: string): void {
  try {
    window.localStorage.setItem(SEEN_KEY, value);
  } catch {
    // Nothing to do: the badge simply will not persist across reloads.
  }
  for (const listener of seenListeners) listener();
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "baru saja";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

const KIND_STYLES: Record<FeedItem["kind"], { ring: string; icon: typeof IconClock }> = {
  pending: { ring: "border-warn/30 bg-warn/10 text-warn", icon: IconClock },
  advanced: { ring: "border-ok/30 bg-ok/10 text-ok", icon: IconCheck },
  rejected: { ring: "border-danger/30 bg-danger/10 text-danger", icon: IconAlert },
};

export function NotificationBell() {
  const pathname = usePathname();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [open, setOpen] = useState(false);
  const seen = useSyncExternalStore(subscribeSeen, readSeen, () => null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const payload = await response.json();
      if (payload?.ok) setFeed(payload.data as Feed);
    } catch {
      // A failed poll keeps whatever was last shown. Replacing a real feed with
      // an error banner because one request lost the network helps nobody.
    }
  }, []);

  // Refetch on an interval and whenever the route changes, since navigating is
  // usually what follows acting on one of these. The first fetch is scheduled
  // rather than run inline, so this effect only ever starts timers and every
  // state update lands in a callback.
  useEffect(() => {
    const immediate = setTimeout(load, 0);
    const timer = setInterval(load, POLL_MS);
    return () => {
      clearTimeout(immediate);
      clearInterval(timer);
    };
  }, [load, pathname]);

  // Close on an outside press or Escape — a panel that traps the page is worse
  // than one that closes too eagerly.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const items = feed?.items ?? [];
  const unread = unreadSince(items, seen);

  function toggle() {
    const next = !open;
    setOpen(next);
    // Opening is what marks things read, and the mark is the newest item's own
    // timestamp rather than `now`: anything that lands between this render and
    // the next poll stays unread instead of being swallowed by the clock.
    if (next && items.length > 0) {
      markSeen(items[0].at);
    }
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          unread.length > 0 ? `Notifikasi, ${unread.length} baru` : "Notifikasi"
        }
        className={`relative grid size-8 place-items-center rounded-lg border transition-colors ${
          open
            ? "border-accent/50 bg-elevated text-ink"
            : "border-hairline text-ink-muted hover:border-hairline-strong hover:text-ink"
        }`}
      >
        <IconBell className="size-4" />
        {unread.length > 0 ? (
          <span
            className="absolute -top-1.5 -right-1.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-ink"
            aria-hidden
          >
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-label="Notifikasi"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={TRANSITION_FAST}
            className="absolute right-0 z-40 mt-2 w-[22rem] origin-top-right overflow-hidden rounded-xl border border-hairline-strong bg-surface shadow-[var(--shadow-panel)]"
          >
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <span className="text-sm font-semibold text-ink">Notifikasi</span>
              <span className="text-xs text-ink-faint">
                {feed ? `${feed.pending} menunggu tindakan` : "Memuat…"}
              </span>
            </div>

            <div className="max-h-[24rem] overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <span className="mx-auto grid size-12 place-items-center rounded-full border border-hairline bg-elevated/60 text-ink-faint">
                    <IconInbox className="size-5" />
                  </span>
                  <p className="mt-3 text-sm text-ink-muted">
                    {feed ? "Belum ada aktivitas." : "Memuat…"}
                  </p>
                </div>
              ) : (
                <ul>
                  {items.slice(0, 30).map((item) => {
                    const style = KIND_STYLES[item.kind];
                    const isUnread = !seen || item.at > seen;
                    return (
                      <li
                        key={item.id}
                        className={`border-b border-hairline/60 last:border-0 ${
                          isUnread ? "bg-accent/[0.04]" : ""
                        }`}
                      >
                        <div className="flex gap-3 px-4 py-3">
                          <span
                            className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border ${style.ring}`}
                            aria-hidden
                          >
                            <style.icon className="size-3.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm leading-snug text-ink">{item.title}</p>
                            <p className="mt-0.5 text-xs leading-snug text-ink-muted">
                              {item.detail}
                            </p>
                            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-faint">
                              <time dateTime={item.at}>{relativeTime(item.at)}</time>
                              {item.issueUrl ? (
                                <>
                                  <span aria-hidden>·</span>
                                  <a
                                    href={item.issueUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 font-mono text-accent-soft hover:underline"
                                  >
                                    {item.issueKey}
                                    <IconExternal className="size-3" />
                                  </a>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <Link
              href="/requests"
              onClick={() => setOpen(false)}
              className="block border-t border-hairline px-4 py-2.5 text-center text-xs text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
            >
              Lihat semua persetujuan
            </Link>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
