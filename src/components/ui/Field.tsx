import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { IconChevron } from "@/components/ui/Icons";

/**
 * The one place a form control's appearance is defined.
 *
 * Every input, select and textarea in the app pulls from this string. Before it
 * existed the same forty characters of Tailwind were pasted into a dozen files,
 * which is why the transfer form's inputs had quietly drifted away from the
 * ones on the create-user page.
 */
export const CONTROL_CLASSES =
  "w-full rounded-lg border border-hairline-strong bg-canvas/60 px-3 py-2 text-sm text-ink " +
  "placeholder:text-ink-faint transition-colors duration-200 hover:border-hairline-strong/80 " +
  "focus:border-accent focus:outline-none";

/** Extra left padding when a control carries a leading icon. */
const WITH_ICON = "pl-9";

/**
 * The leading glyph inside a control.
 *
 * It brightens to the accent while the field has focus, so the icon is part of
 * the focus state rather than decoration sitting next to one. `group-focus-within`
 * does the work — no state, no handlers.
 */
function LeadingIcon({ children, align = "center" }: { children: ReactNode; align?: "center" | "top" }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute left-3 text-ink-faint transition-colors duration-200 group-focus-within:text-accent ${
        align === "top" ? "top-2.5" : "top-1/2 -translate-y-1/2"
      }`}
    >
      {children}
    </span>
  );
}

interface FieldShellProps {
  label: string;
  name: string;
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Label, control, and whichever of the error or hint applies. */
function FieldShell({ label, name, error, hint, className = "", children }: FieldShellProps) {
  return (
    <div className={className}>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      {/* `group` so the icon inside can react to focus anywhere in the control. */}
      <div className="group relative">{children}</div>
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

function describedBy(name: string, error?: string, hint?: ReactNode): string | undefined {
  if (error) return `${name}-error`;
  if (hint) return `${name}-hint`;
  return undefined;
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  error?: string;
  hint?: ReactNode;
  /** Leading glyph. Purely supporting — the label still carries the meaning. */
  icon?: ReactNode;
}

/** Labelled text input with inline validation messaging. */
export function Field({ label, name, error, hint, icon, className = "", ...props }: FieldProps) {
  return (
    <FieldShell label={label} name={name} error={error} hint={hint} className={className}>
      {icon ? <LeadingIcon>{icon}</LeadingIcon> : null}
      <input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, error, hint)}
        className={`${CONTROL_CLASSES} ${icon ? WITH_ICON : ""} ${error ? "border-danger/60" : ""}`}
        {...props}
      />
    </FieldShell>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  name: string;
  error?: string;
  hint?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
}

/**
 * A native `<select>`, deliberately. A custom listbox would be another thousand
 * lines of keyboard and screen-reader handling to arrive back where the platform
 * already is; only the arrow is replaced, because the browser's own does not
 * take the palette.
 */
export function SelectField({
  label,
  name,
  error,
  hint,
  icon,
  className = "",
  children,
  ...props
}: SelectFieldProps) {
  return (
    <FieldShell label={label} name={name} error={error} hint={hint} className={className}>
      {icon ? <LeadingIcon>{icon}</LeadingIcon> : null}
      <select
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, error, hint)}
        className={`${CONTROL_CLASSES} appearance-none pr-9 ${icon ? WITH_ICON : ""} ${
          error ? "border-danger/60" : ""
        }`}
        {...props}
      >
        {children}
      </select>
      <IconChevron className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-faint" />
    </FieldShell>
  );
}

interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  name: string;
  error?: string;
  hint?: ReactNode;
  icon?: ReactNode;
}

export function TextareaField({
  label,
  name,
  error,
  hint,
  icon,
  className = "",
  ...props
}: TextareaFieldProps) {
  return (
    <FieldShell label={label} name={name} error={error} hint={hint} className={className}>
      {/* Pinned to the top: a multi-line field has no vertical middle to sit in. */}
      {icon ? <LeadingIcon align="top">{icon}</LeadingIcon> : null}
      <textarea
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, error, hint)}
        className={`${CONTROL_CLASSES} resize-y ${icon ? WITH_ICON : ""} ${
          error ? "border-danger/60" : ""
        }`}
        {...props}
      />
    </FieldShell>
  );
}

/** Card wrapper used for every panel on the dashboard. */
export function Card({
  className = "",
  interactive = false,
  children,
}: {
  className?: string;
  /** Lifts and warms its border on hover. For cards that are themselves a control. */
  interactive?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border border-hairline bg-surface/80 backdrop-blur-sm ${
        interactive
          ? "transition-colors duration-200 hover:border-hairline-strong hover:bg-surface"
          : ""
      } ${className}`}
    >
      {children}
    </section>
  );
}
