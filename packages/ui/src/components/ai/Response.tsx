import { memo } from "react";
import { Streamdown } from "streamdown";
import { cn } from "../../lib/cn";

/**
 * The shadcn/ai **Response** — streaming-safe Markdown for assistant replies,
 * built on Streamdown (handles incomplete markdown mid-stream, renders code with
 * Shiki highlighting + a copy button, tables, and lists). Themed to the vs-*
 * palette. Use for assistant text; user messages stay plain.
 */
export const Response = memo(function Response({
  children,
  className,
}: {
  children: string;
  className?: string;
}): React.JSX.Element {
  return (
    <Streamdown
      className={cn(
        "text-xs leading-relaxed text-vs-text-secondary",
        // Tight, chat-sized rhythm mapped onto Streamdown's semantic output.
        "[&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
        "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5",
        "[&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-sm [&_h1]:font-semibold [&_h1]:text-vs-text-primary",
        "[&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-[13px] [&_h2]:font-semibold [&_h2]:text-vs-text-primary",
        "[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-vs-text-primary",
        "[&_a]:text-vs-accent [&_a]:underline [&_a]:underline-offset-2",
        "[&_strong]:font-semibold [&_strong]:text-vs-text-primary",
        "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-vs-bg-elevated [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[11px]",
        "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-vs-border-default",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-vs-border-strong [&_blockquote]:pl-2 [&_blockquote]:text-vs-text-muted",
        "[&_table]:my-2 [&_table]:block [&_table]:overflow-x-auto [&_th]:border [&_th]:border-vs-border-default [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-vs-border-default [&_td]:px-2 [&_td]:py-1",
        className,
      )}
    >
      {children}
    </Streamdown>
  );
});
