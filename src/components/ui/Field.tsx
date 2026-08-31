import type { InputHTMLAttributes, ReactNode } from "react";

const CONTROL_CLASSES =
  "w-full rounded-lg border border-hairline-strong bg-canvas/60 px-3 py-2 text-sm text-ink " +
  "placeholder:text-ink-faint transition-colors hover:border-hairline-strong " +
  "focus:border-accent focus:outline-none";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  error?: string;
  hint?: ReactNode;
}

/** Labelled text input with inline validation messaging. */
export function Field({ label, name, error, hint, className = "", ...props }: FieldProps) {
  const describedBy = error ? `${name}-error` : hint ? `${name}-hint` : undefined;

  return (
    <div className={className}>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`${CONTROL_CLASSES} ${error ? "border-danger/60" : ""}`}
        {...props}
      />
      {error ? (
        <p id={`${name}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="mt-1.5 text-xs text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Card wrapper used for every panel on the dashboard. */
export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={`rounded-2xl border border-hairline bg-surface/80 backdrop-blur-sm ${className}`}
    >
      {children}
    </section>
  );
}
