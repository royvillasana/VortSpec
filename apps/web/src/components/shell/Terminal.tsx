"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { isElectron, onTerminalData } from "@/lib/electron";

interface TerminalProps {
  visible: boolean;
  onClose: () => void;
}

export function Terminal({ visible, onClose }: TerminalProps) {
  const [lines, setLines] = useState<string[]>(["[VortSpec Terminal] Ready.\n"]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasSubscribed = useRef(false);

  useEffect(() => {
    if (!isElectron() || hasSubscribed.current) return;
    hasSubscribed.current = true;

    onTerminalData((data: string) => {
      setLines((prev) => {
        const next = [...prev, data];
        // Cap at 500 lines
        if (next.length > 500) return next.slice(next.length - 500);
        return next;
      });
    });
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  if (!visible) return null;

  return (
    <div className="flex-none border-t border-vs-border-default bg-vs-bg-primary" style={{ height: 220 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-8 bg-vs-bg-surface border-b border-vs-border-default">
        <div className="flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-vs-text-muted">
            <path d="M2 3.5L5 6.5L2 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M6 9.5H10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span className="text-[11px] text-vs-text-muted font-mono">Terminal</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setLines(["[VortSpec Terminal] Cleared.\n"])}
            className="w-6 h-6 rounded flex items-center justify-center text-vs-text-muted hover:text-vs-text-primary hover:bg-vs-bg-elevated cursor-pointer text-[10px]"
            title="Clear"
          >
            ⌫
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 rounded flex items-center justify-center text-vs-text-muted hover:text-vs-text-primary hover:bg-vs-bg-elevated cursor-pointer text-[11px]"
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Output */}
      <div
        ref={scrollRef}
        className="overflow-y-auto font-mono text-[11px] leading-[1.6] text-vs-text-secondary px-4 py-2"
        style={{ height: "calc(100% - 32px)" }}
      >
        {isElectron() ? (
          lines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {colorize(line)}
            </div>
          ))
        ) : (
          <div className="text-vs-text-muted py-4 text-center">
            Terminal is only available in the VortSpec desktop app.
            <br />
            <span className="text-[10px]">In cloud mode, code generation uses the OpenRouter API.</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Basic ANSI-free colorization for terminal output */
function colorize(text: string): string {
  // Strip ANSI codes
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
