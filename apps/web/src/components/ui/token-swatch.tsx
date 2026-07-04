import type { TokenKind } from "@/types/ir";
import { cn } from "@/lib/utils";

interface TokenSwatchProps {
  kind: TokenKind;
  value: string;
  className?: string;
}

export function TokenSwatch({ kind, value, className }: TokenSwatchProps) {
  const base = "w-[18px] h-[18px] rounded-[3px] flex-none";

  if (kind === "color") {
    return (
      <span
        className={cn(base, "border border-vs-border-strong", className)}
        style={{ backgroundColor: value }}
      />
    );
  }

  if (kind === "typography") {
    return (
      <span
        className={cn(
          base,
          "bg-vs-bg-elevated border border-vs-border-strong flex items-center justify-center",
          className,
        )}
      >
        <span className="font-sans text-[9px] text-vs-text-secondary leading-none">
          Ag
        </span>
      </span>
    );
  }

  if (kind === "spacing") {
    return (
      <span
        className={cn(
          base,
          "bg-vs-bg-elevated border border-vs-border-strong flex items-center justify-center",
          className,
        )}
      >
        <span className="w-[10px] h-[3px] bg-vs-text-muted rounded-full" />
      </span>
    );
  }

  if (kind === "radius") {
    return (
      <span
        className={cn(
          base,
          "bg-vs-bg-elevated border border-vs-border-strong flex items-end justify-start p-[3px]",
          className,
        )}
      >
        <span className="w-[8px] h-[8px] border-l-[2px] border-b-[2px] border-vs-text-muted rounded-bl-[4px]" />
      </span>
    );
  }

  if (kind === "shadow") {
    return (
      <span
        className={cn(
          base,
          "bg-vs-bg-elevated border border-vs-border-strong flex items-center justify-center",
          className,
        )}
      >
        <span
          className="w-[8px] h-[8px] rounded-[2px] bg-vs-text-muted"
          style={{ boxShadow: "1px 1px 2px rgba(0,0,0,0.5)" }}
        />
      </span>
    );
  }

  // 'other' fallback
  return (
    <span
      className={cn(
        base,
        "bg-vs-bg-elevated border border-vs-border-strong",
        className,
      )}
    />
  );
}
