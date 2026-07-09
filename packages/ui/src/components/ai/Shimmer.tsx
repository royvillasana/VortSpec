import type { CSSProperties } from "react";
import { cn } from "../../lib/cn";

/**
 * The shadcn/ai **Shimmer** — an animated placeholder for streaming/pending
 * states that avoids layout shift. A moving highlight sweeps across the text
 * (or a block, via `bar`). Themed to the vs-* palette.
 */
export function Shimmer({
  children,
  className,
  bar = false,
}: {
  children?: React.ReactNode;
  className?: string;
  /** Render a solid shimmering bar (skeleton line) instead of shimmering text. */
  bar?: boolean;
}): React.JSX.Element {
  const sweep: CSSProperties = {
    backgroundImage:
      "linear-gradient(90deg, var(--color-vs-text-muted) 0%, var(--color-vs-text-primary) 20%, var(--color-vs-text-muted) 40%)",
    backgroundSize: "200% 100%",
    animation: "vsShimmer 1.6s linear infinite",
  };
  if (bar) {
    return (
      <span
        aria-hidden
        className={cn("block h-3 w-full rounded", className)}
        style={{ ...sweep, WebkitBackgroundClip: "border-box", opacity: 0.25 }}
      />
    );
  }
  return (
    <span
      className={cn("bg-clip-text text-transparent", className)}
      style={sweep}
    >
      {children}
    </span>
  );
}
