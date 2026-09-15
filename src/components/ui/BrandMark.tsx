"use client";

import { motion } from "framer-motion";
import { useState } from "react";

import { getBrand } from "@/lib/config/brand";
import { TRANSITION_FAST } from "@/lib/motion";

/**
 * The company lockup with animated gradient typography and interactive motion.
 */
export function BrandMark({ size = "sm" }: { size?: "sm" | "lg" }) {
  const brand = getBrand();
  const named = brand.name !== "User Management";
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = Boolean(brand.logo) && !logoFailed;

  const logoHeight = size === "lg" ? "h-9" : "h-7";
  const wordmarkSize = size === "lg" ? "text-lg" : "text-sm";
  const tile = size === "lg" ? "size-9 text-sm" : "size-8 text-xs";
  const textSize = size === "lg" ? "text-base font-bold" : "text-sm font-semibold";

  return (
    <motion.span
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={TRANSITION_FAST}
      className="group flex items-center gap-2.5 select-none"
    >
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brand.logo}
          alt={brand.name}
          onError={() => setLogoFailed(true)}
          className={`brand-lockup ${logoHeight} w-auto object-contain transition-transform duration-300 group-hover:scale-105`}
        />
      ) : named ? (
        <span className={`${wordmarkSize} font-semibold tracking-tight text-ink`}>
          {brand.name}
        </span>
      ) : (
        <span
          className={`grid ${tile} place-items-center rounded-lg bg-gradient-to-br from-accent via-accent-soft to-amber-300 font-bold text-accent-ink shadow-[0_0_12px_rgba(253,183,19,0.35)] transition-shadow duration-300 group-hover:shadow-[0_0_18px_rgba(253,183,19,0.6)]`}
          aria-hidden
        >
          HC
        </span>
      )}

      <span className="h-5 w-px bg-hairline-strong/80" aria-hidden />

      <span className="relative flex items-center gap-2">
        <span className={`${textSize} tracking-tight text-shimmer-brand drop-shadow-[0_2px_8px_rgba(253,183,19,0.2)]`}>
          User Management
        </span>
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-accent shadow-[0_0_6px_var(--color-accent)]" />
        </span>
      </span>
    </motion.span>
  );
}

