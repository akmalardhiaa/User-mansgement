import type { ReactNode } from "react";

import { Reveal } from "@/components/motion/Reveal";

/**
 * The heading block every page opens with, featuring eye-candy motion,
 * glowing brand pills, and flexible header layout.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  badge,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <Reveal className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-4 rounded-2xl border border-hairline/60 bg-surface/70 p-6 shadow-[0_8px_30px_rgb(0_0_0_/_0.12)]">
      {/* Top ambient highlight glow line */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

      <div className="min-w-0 flex-1 space-y-1.5">
        {eyebrow || badge ? (
          <div className="flex items-center gap-2.5 flex-wrap">
            {eyebrow ? (
              <p className="text-xs font-bold tracking-[0.16em] text-accent uppercase">
                {eyebrow}
              </p>
            ) : null}
            {badge ? <div>{badge}</div> : null}
          </div>
        ) : null}

        <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-balance text-ink">
          {title}
        </div>

        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p>
        ) : null}
      </div>

      {actions ? (
        <div className="flex flex-wrap items-center gap-3 shrink-0">{actions}</div>
      ) : null}
    </Reveal>
  );
}

