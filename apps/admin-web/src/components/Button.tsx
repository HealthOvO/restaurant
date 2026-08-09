import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonTone = "primary" | "secondary" | "quiet" | "danger";

export function Button({
  tone = "primary",
  loading = false,
  children,
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone; loading?: boolean; children: ReactNode }) {
  return (
    <button {...props} disabled={disabled || loading} className={`button button-${tone} ${className}`.trim()}>
      {loading && <span className="button-spinner" aria-hidden="true" />}
      <span className="button-content">{children}</span>
    </button>
  );
}
