import type { ReactNode } from "react";

import { Reveal } from "@/components/motion/Reveal";
import { BrandMark } from "@/components/ui/BrandMark";
import { Card } from "@/components/ui/Field";

/**
 * The shell the four public account pages share.
 *
 * A server component with no state of its own — the interactive part is always
 * the form passed in as `children`, so registering, confirming an address and
 * resetting a password all arrive looking like one flow rather than three
 * pages that happen to sit near each other.
 */
export function AuthCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    // `content-center` rather than `flex-1`: the shell's <main> is not a flex
    // container, so this has to centre itself against its own min-height.
    <div className="mx-auto grid w-full max-w-md min-h-[68vh] content-center gap-6">
      <Reveal>
        <div className="mb-6">
          <BrandMark size="lg" />
        </div>

        <div className="mb-6 space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface/80 px-3 py-1 text-xs text-ink-muted backdrop-blur-sm">
            <span className="size-1.5 animate-pulse rounded-full bg-accent" />
            <span className="font-semibold text-shimmer-brand">{eyebrow}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="text-sm text-ink-muted">{description}</p>
        </div>

        <Card className="relative overflow-hidden border-hairline-strong/70 p-6 shadow-[0_12px_40px_-15px_rgba(7,19,33,0.6)] backdrop-blur-xl sm:p-7">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent opacity-80" />
          {children}
        </Card>
      </Reveal>
    </div>
  );
}
