import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  // Gold is a light surface, so its label takes the navy ground rather than white.
  primary:
    "bg-accent text-accent-ink font-semibold border border-accent/70 hover:bg-accent-soft " +
    "hover:shadow-[0_0_20px_-4px_var(--color-accent)]",
  secondary:
    "bg-elevated text-ink border border-hairline-strong hover:border-accent/50 hover:bg-elevated/70",
  ghost: "bg-transparent text-ink-muted border border-hairline hover:bg-elevated hover:text-ink",
  danger: "bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20",
  // Mirrors `danger` so a red/green pair reads as one control in two states
  // rather than two differently-weighted buttons.
  success: "bg-ok/10 text-ok border border-ok/30 hover:bg-ok/20",
};

const SIZES: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-xs gap-1.5",
  md: "px-3.5 py-2 text-sm gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner in place of any icon and blocks further presses. */
  loading?: boolean;
  /** Leading glyph. Hidden while `loading`, so the button never grows or shrinks. */
  icon?: ReactNode;
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="size-[1.15em] shrink-0 animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Press feedback is a CSS transform rather than a Framer spring: this is the
 * most-used control in the app, and a scale on `:active` costs nothing per
 * instance. The reduced-motion rule in globals.css neutralises it for anyone
 * who has asked for that.
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className = "",
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}
