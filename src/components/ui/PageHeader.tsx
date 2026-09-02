import type { ReactNode } from "react";

import { Reveal } from "@/components/motion/Reveal";

/**
 * The heading block every page opens with: an eyebrow, a title, a line of
 * explanation, and the page's actions pushed to the far end.
 *
 * Shared so the three pages cannot drift apart in type size or spacing, which
 * they had already started to do.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Reveal className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1.5 text-xs font-medium tracking-[0.14em] text-accent uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-prose text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="ml-auto flex flex-wrap items-center gap-3">{actions}</div> : null}
    </Reveal>
  );
}
