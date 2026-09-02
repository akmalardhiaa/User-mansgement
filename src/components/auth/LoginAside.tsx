"use client";

import gsap from "gsap";
import { useEffect, useRef } from "react";

const POINTS = [
  "Direktori karyawan dengan pencarian dan penyaringan",
  "Persetujuan manager dan IT Security lewat tiket Jira",
  "Jejak audit lengkap untuk setiap perubahan akses",
];

/**
 * The panel beside the sign-in form.
 *
 * The two blurred fields behind it drift on a GSAP timeline — slow enough to be
 * ambient rather than a distraction, and it is the only page in the app with
 * room for something purely atmospheric. Everything past the login screen is a
 * working tool and gets none of this.
 */
export function LoginAside() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Anyone who has asked for less motion gets the panel with the fields
    // sitting still. GSAP has no equivalent of Framer's MotionConfig, so this
    // is checked by hand.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // A context scopes every selector below to this subtree and gives one
    // `revert()` that cleans up all of it on unmount.
    const context = gsap.context(() => {
      gsap.to(".login-orb-a", {
        x: 40,
        y: -30,
        scale: 1.15,
        duration: 9,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
      gsap.to(".login-orb-b", {
        x: -34,
        y: 26,
        scale: 0.9,
        duration: 11,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    }, root);

    return () => context.revert();
  }, []);

  return (
    <div
      ref={root}
      className="relative hidden overflow-hidden rounded-2xl border border-hairline bg-surface/60 p-8 lg:block"
    >
      <div
        className="login-orb-a pointer-events-none absolute -top-16 -left-10 size-56 rounded-full bg-accent/20 blur-3xl"
        aria-hidden
      />
      <div
        className="login-orb-b pointer-events-none absolute -right-12 -bottom-16 size-64 rounded-full bg-info/20 blur-3xl"
        aria-hidden
      />

      <div className="relative">
        <p className="text-xs font-medium tracking-[0.14em] text-accent uppercase">
          Human Capital
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-balance">
          Satu portal untuk seluruh siklus akses karyawan.
        </h2>
        <p className="mt-3 text-sm text-ink-muted">
          Dari pengajuan akun baru sampai perpindahan divisi — setiap langkah tercatat dan
          disetujui di tempat yang sama.
        </p>

        <ul className="mt-8 space-y-3">
          {POINTS.map((point) => (
            <li key={point} className="flex items-start gap-2.5 text-sm text-ink-muted">
              <span
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent"
                aria-hidden
              />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
