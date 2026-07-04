"use client";

import { cn } from "@/lib/utils";

interface SegmentedControlProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "md";
  className?: string;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  size = "md",
  className,
}: SegmentedControlProps) {
  return (
    <div
      className={cn(
        "bg-vs-bg-surface border border-vs-border-default rounded-lg p-0.5 inline-flex gap-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              "text-[12px] px-3 py-1 rounded-md border-none cursor-pointer font-sans transition-colors",
              size === "sm" && "px-2 py-0.5 text-[11px]",
              active
                ? "bg-vs-bg-elevated text-vs-text-primary"
                : "text-vs-text-secondary hover:text-vs-text-primary",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
