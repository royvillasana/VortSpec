import { cn } from "@/lib/utils";

interface CompletenessScoreProps {
  score: number;
  className?: string;
}

export function CompletenessScore({ score, className }: CompletenessScoreProps) {
  const colorClass =
    score >= 80
      ? "text-vs-success"
      : score >= 60
        ? "text-vs-warning"
        : "text-vs-error";

  return (
    <span
      className={cn(
        "font-mono text-[12px] font-medium border border-vs-border-strong rounded-full px-[10px] py-[3px] bg-vs-bg-elevated",
        colorClass,
        className,
      )}
    >
      {score}%
    </span>
  );
}
