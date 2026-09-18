"use client";

import { motion } from "framer-motion";

import { IconApprovals, IconCheck, IconUser } from "@/components/ui/Icons";
import { stagger, staggerItem, TRANSITION_FAST } from "@/lib/motion";

/**
 * The three ambient orbs behind the panel.
 *
 * Framer rather than GSAP, which used to drive these through a `gsap.context`.
 * That was the only other thing in the app GSAP did — a second animation
 * runtime, 68.5 KB of client bundle confirmed by inspecting the built chunks,
 * for this and one counter. Framer was already loaded for everything else.
 *
 * `repeatType: "reverse"` is GSAP's `yoyo`, and the drift is unchanged.
 * Reduced motion is no longer asked about by hand: MotionProvider sets
 * `reducedMotion="user"` app-wide, so Framer drops these transforms itself.
 */
const ORBS = [
  {
    className: "-top-20 -left-12 size-64 bg-accent/25",
    animate: { x: 45, y: -35, scale: 1.2 },
    duration: 9,
  },
  {
    className: "-right-16 -bottom-20 size-72 bg-info/20",
    animate: { x: -40, y: 30, scale: 0.85 },
    duration: 11,
  },
  {
    className: "top-1/2 left-1/3 size-56 -translate-y-1/2 bg-purple-500/15",
    animate: { x: 25, y: 40, scale: 1.1 },
    duration: 13,
  },
] as const;

const FEATURE_POINTS = [
  {
    title: "Direktori Karyawan Terintegrasi",
    description: "Pencarian cepat, penyaringan divisi, dan manajemen status akun secara real-time.",
    icon: IconUser,
  },
  {
    title: "Persetujuan Bertingkat lewat Email",
    description: "Alur persetujuan terverifikasi oleh Manager dan IT Security otomatis melalui email.",
    icon: IconApprovals,
  },
  {
    title: "Jejak Audit Lintas Sistem",
    description: "Rekam jejak transparan dan akuntabel untuk setiap perubahan hak akses.",
    icon: IconCheck,
  },
];

export function LoginAside() {
  return (
    <div className="relative hidden overflow-hidden rounded-3xl border border-hairline-strong/80 bg-surface/70 p-9 backdrop-blur-xl lg:block shadow-[0_20px_50px_rgba(7,19,33,0.5)]">
      {/* Ambient background glowing orbs */}
      {ORBS.map((orb) => (
        <motion.div
          key={orb.className}
          aria-hidden
          animate={orb.animate}
          transition={{
            duration: orb.duration,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut",
          }}
          className={`pointer-events-none absolute rounded-full blur-3xl ${orb.className}`}
        />
      ))}

      <div className="relative z-10">
        {/* Animated Pill Badge */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1.5 backdrop-blur-md shadow-[0_0_15px_rgba(253,183,19,0.2)]"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-accent" />
          </span>
          <span className="text-xs font-bold tracking-widest text-accent uppercase">
            HUMAN CAPITAL PLATFORM
          </span>
        </motion.div>

        {/* Hero Title with Shimmer */}
        <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-balance leading-tight">
          Portal Terpadu <br />
          <span className="text-shimmer-brand text-4xl drop-shadow-[0_4px_12px_rgba(253,183,19,0.25)]">
            User Management
          </span>
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-ink-muted/90 max-w-md">
          Kelola siklus hidup akses akun karyawan secara otomatis, aman, dan transparan melalui satu dasbor modern.
        </p>

        {/* Staggered Animated Feature Cards */}
        <motion.div
          variants={stagger(0.1, 0.15)}
          initial="hidden"
          animate="visible"
          className="mt-8 space-y-3.5"
        >
          {FEATURE_POINTS.map((item) => (
            <motion.div
              key={item.title}
              variants={staggerItem}
              whileHover={{ x: 6, scale: 1.015 }}
              transition={TRANSITION_FAST}
              className="group flex items-start gap-3.5 rounded-2xl border border-hairline/70 bg-canvas/60 p-4 backdrop-blur-md transition-all duration-300 hover:border-accent/50 hover:bg-canvas/90 hover:shadow-[0_8px_25px_-8px_rgba(253,183,19,0.2)]"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent/15 text-accent shadow-[0_0_12px_rgba(253,183,19,0.2)] transition-transform duration-300 group-hover:scale-110">
                <item.icon className="size-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink group-hover:text-accent transition-colors duration-200">
                  {item.title}
                </h3>
                <p className="mt-0.5 text-xs text-ink-muted leading-normal">
                  {item.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

