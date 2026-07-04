import type { IssueSeverity } from "@/types/ir";
import { cn } from "@/lib/utils";

interface SeverityIconProps {
  severity: IssueSeverity;
  className?: string;
}

export function SeverityIcon({ severity, className }: SeverityIconProps) {
  if (severity === "info") {
    return (
      <span
        className={cn(
          "inline-block w-2 h-2 rounded-full bg-vs-text-muted flex-none",
          className,
        )}
      />
    );
  }

  // Diamond shape for error and warning
  const fillColor = severity === "error" ? "bg-vs-error" : "bg-vs-warning";

  return (
    <span
      className={cn(
        "inline-block w-2 h-2 rotate-45 rounded-[1px] flex-none",
        fillColor,
        className,
      )}
    />
  );
}
