import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "../../lib/cn";

/**
 * The shadcn/ai **Snippet** — a compact, copyable inline code card (a command, a
 * path, a one-liner). For multi-line fenced code in assistant prose, Streamdown's
 * Response already renders highlighted blocks with copy; this is for the small
 * standalone bits (e.g. the command behind a Bash tool card).
 */
export function Snippet({ code, className }: { code: string; className?: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded border border-vs-border-subtle bg-vs-bg-code px-2 py-1 font-mono text-[10px]",
        className,
      )}
    >
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre text-vs-text-secondary">{code}</code>
      <button
        type="button"
        onClick={copy}
        title="Copy"
        aria-label="Copy"
        className="shrink-0 text-vs-text-muted hover:text-vs-text-primary"
      >
        {copied ? <Check size={11} className="text-vs-success" /> : <Copy size={11} />}
      </button>
    </div>
  );
}
