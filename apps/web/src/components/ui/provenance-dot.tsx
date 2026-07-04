import type { Confidence } from "@/types/ir";
import { cn } from "@/lib/utils";

interface ProvenanceDotProps {
  confidence: Confidence;
  className?: string;
}

const dotColors: Record<Confidence, string> = {
  confirmed: "bg-vs-success",
  inferred: "bg-vs-warning",
  pending: "bg-vs-text-muted",
};

export function ProvenanceDot({ confidence, className }: ProvenanceDotProps) {
  return (
    <span
      className={cn(
        "inline-block w-[7px] h-[7px] rounded-full flex-none",
        dotColors[confidence],
        className,
      )}
      title={confidence}
    />
  );
}
