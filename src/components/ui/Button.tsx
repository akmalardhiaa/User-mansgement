import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  // Gold is a light surface, so its label takes the navy ground rather than white.
  /*
   * The gold button also takes a band of light across it on hover. Only this
   * one: there is a single primary action per screen, and a sheen on every
   * control in the app would be wallpaper rather than emphasis.
   *
   * `before:duration-0` with the length applied only under `:hover` is what
   * stops the band sweeping backwards when the pointer leaves — off the hover
   * the transition has no duration, so it simply is not there any more.
   */
  primary:
    "bg-accent text-accent-ink font-semibold border border-accent/70 hover:bg-accent-soft " +
    "hover:shadow-[0_0_20px_-4px_var(--color-accent)] relative overflow-hidden " +
    "before:pointer-events-none before:absolute before:inset-y-0 before:-left-full before:w-full " +
    "before:-skew-x-12 before:bg-gradient-to-r before:from-transparent before:via-white/35 " +
    "before:to-transparent before:content-[''] before:transition-transform before:duration-0 " +
    "before:ease-(--ease-out-quint) hover:before:translate-x-[250%] hover:before:duration-700",
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

const BASE =
  "inline-flex items-center justify-center rounded-lg font-medium transition-all " +
  "duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] " +
  "disabled:pointer-events-none disabled:opacity-50";

/**
 * The button's appearance, for the handful of places that need it on something
 * that is not a button.
 *
 * A `<Link>` styled as the primary action is a link, not a button, and wrapping
 * one in the other produces markup no assistive technology can read. So the
 * classes are exported instead — which is how the gold call to action on three
 * separate pages had ended up as three hand-copied strings that had already
 * drifted apart, two of them missing the hover shadow the third had.
 */
export function buttonClasses(variant: Variant = "primary", size: Size = "md"): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}`;
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
      className={`${buttonClasses(variant, size)} ${className}`}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}
