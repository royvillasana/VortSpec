import { useState } from "react";
import { ListTodo, ChevronDown, Circle, CheckCircle2, Loader2 } from "lucide-react";
import type { PlanItem } from "@vortspec/ui/run-model";
import { cn } from "../../lib/cn";

/**
 * The shadcn/ai **Plan** — Claude's live task checklist, from its TodoWrite tool.
 * Each TodoWrite call replaces the plan, so this always reflects current
 * progress: pending / in-progress (spinner) / completed (struck through).
 */
export function Plan({ items }: { items: PlanItem[] }): React.JSX.Element | null {
  const [open, setOpen] = useState(true);
  if (items.length === 0) return null;
  const done = items.filter((i) => i.status === "completed").length;
  return (
    <div className="rounded-lg border border-vs-border-default bg-vs-bg-surface/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-[11px] text-vs-text-muted hover:text-vs-text-secondary"
      >
        <ListTodo size={12} />
        <span>
          Plan · {done}/{items.length}
        </span>
        <ChevronDown size={12} className={cn("ml-auto transition-transform", open ? "" : "-rotate-90")} />
      </button>
      {open && (
        <ol className="space-y-1 px-2.5 pb-2">
          {items.map((it, i) => (
            <li key={`${i}-${it.content}`} className="flex items-start gap-2 text-[11px]">
              <span className="mt-[1px] shrink-0">
                {it.status === "completed" ? (
                  <CheckCircle2 size={12} className="text-vs-success" />
                ) : it.status === "in_progress" ? (
                  <Loader2 size={12} className="animate-spin text-vs-accent" />
                ) : (
                  <Circle size={12} className="text-vs-text-muted" />
                )}
              </span>
              <span
                className={cn(
                  it.status === "completed"
                    ? "text-vs-text-muted line-through"
                    : it.status === "in_progress"
                      ? "text-vs-text-primary"
                      : "text-vs-text-secondary",
                )}
              >
                {it.content}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
