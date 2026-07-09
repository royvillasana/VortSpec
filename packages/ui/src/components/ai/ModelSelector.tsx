import { useState } from "react";
import { ChevronsUpDown, Check } from "lucide-react";
import { KNOWN_MODELS } from "./slash-commands";
import { cn } from "../../lib/cn";

/** Compact label for a model id like "claude-opus-4-8[1m]" → "opus-4-8[1m]"
 *  (keeps the variant tag so the real model in use is visible). */
function short(model?: string): string {
  if (!model) return "model";
  return model.replace(/^claude-/, "").replace(/-\d{8}(?=\[|$)/, "");
}

/**
 * The shadcn/ai **Model Selector** — an always-visible dropdown in the composer
 * toolbar. Shows the active (or picked) model and lets the user switch; the
 * choice is applied via `--model` on the next message.
 */
export function ModelSelector({
  active,
  selected,
  onSelect,
}: {
  /** The session's current model id (from init). */
  active?: string;
  /** The user's picked model alias, if any. */
  selected?: string;
  onSelect: (alias: string | undefined) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  // Show the model Claude is ACTUALLY using (from the session's init event) once a
  // run exists; before that, fall back to the user's picked model or a placeholder.
  const label = active
    ? short(active)
    : selected
      ? KNOWN_MODELS.find((m) => m.alias === selected)?.label ?? selected
      : "model";
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Model — switch the model for your next message"
        className="flex items-center gap-1 rounded-md border border-vs-border-default px-2 py-1 font-mono text-[10px] text-vs-text-muted hover:text-vs-text-secondary"
      >
        {label}
        <ChevronsUpDown size={11} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            className="absolute bottom-full left-0 z-50 mb-1 min-w-[200px] rounded-md border border-vs-border-default bg-vs-bg-elevated py-1 shadow-xl"
          >
            {active && (
              <div className="px-3 py-1 text-[10px] text-vs-text-muted">
                Active: <span className="font-mono">{short(active)}</span>
              </div>
            )}
            {KNOWN_MODELS.map((m) => {
              const isSel = selected === m.alias;
              return (
                <button
                  key={m.alias}
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  onClick={() => {
                    onSelect(isSel ? undefined : m.alias);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
                    isSel ? "text-vs-text-primary" : "text-vs-text-secondary hover:bg-vs-bg-hover",
                  )}
                >
                  <Check size={12} className={cn(isSel ? "text-vs-accent" : "opacity-0")} />
                  <span className="flex-1">{m.label}</span>
                  <span className="text-[10px] text-vs-text-muted">{m.hint}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
