import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { CheckStatus } from "../../../shared/ipc";

export function Button({
  variant = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost";
}): React.JSX.Element {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle";
  const variants: Record<string, string> = {
    primary: "bg-vs-accent text-white hover:opacity-90",
    default:
      "bg-vs-bg-elevated text-vs-text-primary border border-vs-border-default hover:bg-vs-bg-hover",
    ghost: "text-vs-text-secondary hover:bg-vs-bg-hover hover:text-vs-text-primary",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={`rounded-lg border border-vs-border-default bg-vs-bg-surface ${className}`}
    >
      {children}
    </div>
  );
}

export function Spinner(): React.JSX.Element {
  return (
    <span
      className="inline-block h-3.5 w-3.5 rounded-full border-2 border-vs-border-strong border-t-vs-accent"
      style={{ animation: "vsSpin 0.7s linear infinite" }}
    />
  );
}

const statusStyles: Record<CheckStatus, { dot: string; label: string }> = {
  pass: { dot: "bg-vs-success", label: "text-vs-success" },
  fail: { dot: "bg-vs-error", label: "text-vs-error" },
  unknown: { dot: "bg-vs-text-muted", label: "text-vs-text-muted" },
  checking: { dot: "bg-vs-warning", label: "text-vs-warning" },
};

export function StatusDot({ status }: { status: CheckStatus }): React.JSX.Element {
  if (status === "checking") return <Spinner />;
  return (
    <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusStyles[status].dot}`} />
  );
}

export function statusLabelClass(status: CheckStatus): string {
  return statusStyles[status].label;
}
