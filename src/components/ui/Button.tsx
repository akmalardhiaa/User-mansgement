import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  // Gold is a light surface, so its label takes the navy ground rather than white.
  primary:
    "bg-accent text-accent-ink font-semibold hover:bg-accent-soft border border-accent/70",
  secondary: "bg-elevated text-ink border border-hairline-strong hover:border-accent/50",
  ghost: "bg-transparent text-ink-muted border border-hairline hover:bg-elevated hover:text-ink",
  danger: "bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  );
}
