import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { CheckStatus } from "@vortspec/core/ipc";
import { HoverTip } from "./HoverTip";

export function Button({
  variant = "default",
  className = "",
  tip,
  tipSide = "bottom",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost";
  /** A hover tooltip in the app's styled form (same as the activity-bar icons), instead of the
   *  OS's delayed/unstyled native `title`. Rendered in a body portal so it's never clipped. */
  tip?: string;
  tipSide?: "left" | "right" | "top" | "bottom";
}): React.JSX.Element {
  const base =
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle active:brightness-95";
  const variants: Record<string, string> = {
    // Accent action — a faint top highlight + a soft accent glow lift it off the surface.
    primary:
      "bg-vs-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_10px_-3px_rgba(124,111,240,0.55)] hover:brightness-110",
    // Neutral action — a subtle top→bottom gradient + hairline border + top-edge highlight,
    // matching the app's floating-panel "glass" look; brightens on hover.
    default:
      "border border-vs-border-default bg-gradient-to-b from-vs-bg-elevated to-vs-bg-surface text-vs-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-vs-border-strong hover:brightness-110",
    ghost: "text-vs-text-secondary hover:bg-vs-bg-hover hover:text-vs-text-primary",
  };
  const button = <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
  return tip ? (
    <HoverTip label={tip} side={tipSide}>
      {button}
    </HoverTip>
  ) : (
    button
  );
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
