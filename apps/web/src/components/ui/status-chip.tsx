import type { ComponentStatus } from "@/types/ir";
import { cn } from "@/lib/utils";

interface StatusChipProps {
  status: ComponentStatus;
  className?: string;
}

const statusStyles: Record<
  ComponentStatus,
  { text: string; dot: string }
> = {
  imported: {
    text: "text-vs-text-muted",
    dot: "bg-vs-text-muted",
  },
  normalized: {
    text: "text-vs-warning",
    dot: "bg-vs-warning",
  },
  approved: {
    text: "text-vs-success",
    dot: "bg-vs-success",
  },
};

export function StatusChip({ status, className }: StatusChipProps) {
  const style = statusStyles[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[11px] border border-vs-border-strong rounded-full px-2.5 py-0.5",
        style.text,
        className,
      )}
    >
      <span
        className={cn("w-[6px] h-[6px] rounded-full flex-none", style.dot)}
      />
      {status}
    </span>
  );
}
