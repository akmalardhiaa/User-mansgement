import type { ReactNode } from "react";

import { Reveal } from "@/components/motion/Reveal";

/**
 * The heading block every page opens with.
 *
 * `compact` exists for the pages whose real content is a form: there the
 * heading is orientation, not the point, and at 155 pixels it was taking a
 * fifth of a laptop screen to say what the highlighted nav item already says.
 * Compact puts the eyebrow on the same line as the title and shrinks the
 * padding; it drops nothing, so the page still reads the same, just smaller.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  badge,
  compact = false,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
  /** For pages that exist to hold a form below this. */
  compact?: boolean;
}) {
  return (
    <Reveal
      className={`relative flex flex-wrap items-end justify-between gap-x-6 gap-y-2 rounded-2xl border border-hairline/60 bg-surface/70 shadow-[0_8px_30px_rgb(0_0_0_/_0.12)] ${
        compact ? "px-4 py-2.5" : "px-5 py-4 gap-y-3"
      }`}
    >
      {/* Top ambient highlight glow line */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

      <div className={`min-w-0 flex-1 ${compact ? "" : "space-y-1"}`}>
        {compact ? (
          // One line: eyebrow, title, and whatever badge belongs beside them.
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            {eyebrow ? (
              <p className="text-[11px] font-bold tracking-[0.16em] text-accent uppercase">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="text-lg font-extrabold tracking-tight text-ink">{title}</h1>
            {badge ? <div>{badge}</div> : null}
          </div>
        ) : (
          <>
            {eyebrow || badge ? (
              <div className="flex flex-wrap items-center gap-2.5">
                {eyebrow ? (
                  <p className="text-xs font-bold tracking-[0.16em] text-accent uppercase">
                    {eyebrow}
                  </p>
                ) : null}
                {badge ? <div>{badge}</div> : null}
              </div>
            ) : null}

            <div className="text-xl font-extrabold tracking-tight text-balance text-ink sm:text-2xl">
              {title}
            </div>
          </>
        )}

        {description ? (
          <p
            className={`max-w-4xl leading-snug text-ink-muted ${
              compact ? "mt-0.5 text-xs" : "text-sm"
            }`}
          >
            {description}
          </p>
        ) : null}
      </div>

      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div> : null}
    </Reveal>
  );
}
