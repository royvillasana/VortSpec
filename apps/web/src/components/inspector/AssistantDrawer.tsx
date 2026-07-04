"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAssistant } from "./AssistantContext";
import { useToast } from "@/components/ui/toast";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface RenameOp {
  from: string;
  to: string;
}

type MessageRole = "user" | "assistant";

interface UserMessage {
  id: number;
  role: "user";
  text: string;
}

interface PatchCard {
  title: string;
  renames: RenameOp[];
  visibleCount: number;
  status: "pending" | "applied" | "rejected";
  versionFrom?: number;
  versionTo?: number;
}

interface AssistantMessage {
  id: number;
  role: "assistant";
  text?: string;
  patch?: PatchCard;
  choiceChips?: string[];
  drafting?: boolean;
}

type Message = UserMessage | AssistantMessage;

/* ------------------------------------------------------------------ */
/*  Sample conversation                                               */
/* ------------------------------------------------------------------ */

function createInitialMessages(): Message[] {
  return [
    {
      id: 1,
      role: "user",
      text: "rename all color tokens to the semantic/primary/500 format",
    },
    {
      id: 2,
      role: "assistant",
      patch: {
        title: "Rename color tokens to semantic format",
        renames: [
          { from: "color/primary/100", to: "semantic/primary/100" },
          { from: "color/primary/200", to: "semantic/primary/200" },
          { from: "color/primary/300", to: "semantic/primary/300" },
          { from: "color/primary/400", to: "semantic/primary/400" },
          { from: "color/primary/500", to: "semantic/primary/500" },
          { from: "color/secondary/100", to: "semantic/secondary/100" },
          { from: "color/secondary/200", to: "semantic/secondary/200" },
          { from: "color/secondary/300", to: "semantic/secondary/300" },
          { from: "color/accent/100", to: "semantic/accent/100" },
          { from: "color/accent/200", to: "semantic/accent/200" },
          { from: "color/accent/300", to: "semantic/accent/300" },
          { from: "color/neutral/100", to: "semantic/neutral/100" },
          { from: "color/neutral/200", to: "semantic/neutral/200" },
          { from: "color/neutral/300", to: "semantic/neutral/300" },
          { from: "color/neutral/400", to: "semantic/neutral/400" },
          { from: "color/neutral/500", to: "semantic/neutral/500" },
          { from: "color/success", to: "semantic/success/500" },
          { from: "color/error", to: "semantic/error/500" },
        ],
        visibleCount: 5,
        status: "pending",
        versionFrom: 13,
        versionTo: 14,
      },
    },
    {
      id: 3,
      role: "user",
      text: "set radius to 12px on all form components",
    },
    {
      id: 4,
      role: "assistant",
      text: 'I found several form components. Which ones should I update?',
      choiceChips: [
        "All form inputs, selects, and textareas",
        "Only buttons and toggles",
      ],
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 12V4M8 4L4.5 7.5M8 4L11.5 7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DraftingSkeleton() {
  return (
    <div className="flex flex-col gap-2 py-2">
      <div
        className="h-2 rounded bg-vs-border-default w-3/4"
        style={{ animation: "vsPulse 1.5s ease-in-out infinite" }}
      />
      <div
        className="h-2 rounded bg-vs-border-default w-1/2"
        style={{ animation: "vsPulse 1.5s ease-in-out infinite 0.2s" }}
      />
      <div
        className="h-2 rounded bg-vs-border-default w-2/3"
        style={{ animation: "vsPulse 1.5s ease-in-out infinite 0.4s" }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Patch Card Component                                              */
/* ------------------------------------------------------------------ */

function PatchCardView({
  patch,
  onApply,
  onReject,
  onUndo,
}: {
  patch: PatchCard;
  onApply: () => void;
  onReject: () => void;
  onUndo: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visibleRenames = showAll
    ? patch.renames
    : patch.renames.slice(0, patch.visibleCount);
  const hiddenCount = patch.renames.length - patch.visibleCount;

  return (
    <div className="bg-vs-bg-elevated border border-vs-border-strong rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-[12px] text-vs-text-primary font-medium flex-1">
          {patch.title}
        </span>
        <span className="font-mono text-[10px] text-vs-text-muted border border-vs-border-default rounded px-1.5">
          patch
        </span>
      </div>

      {/* Diff rows */}
      <div className="px-3 pb-2">
        {visibleRenames.map((r, i) => (
          <div
            key={i}
            className="flex items-center gap-1.5 font-mono text-[11px] py-0.5"
          >
            <span className="text-vs-text-muted line-through truncate">
              {r.from}
            </span>
            <span className="text-vs-text-muted flex-none">&rarr;</span>
            <span className="bg-[rgba(48,164,108,0.12)] text-vs-success px-1 rounded-sm truncate">
              {r.to}
            </span>
          </div>
        ))}

        {!showAll && hiddenCount > 0 && (
          <button
            onClick={() => setShowAll(true)}
            className="text-vs-accent font-mono text-[11px] mt-1 hover:underline"
          >
            +{hiddenCount} more
          </button>
        )}
        {showAll && hiddenCount > 0 && (
          <button
            onClick={() => setShowAll(false)}
            className="text-vs-accent font-mono text-[11px] mt-1 hover:underline"
          >
            Show less
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-vs-border-default px-3 py-2.5">
        {patch.status === "pending" && (
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={onReject}
              className="border border-vs-border-strong text-vs-text-secondary rounded-md px-2.5 py-1 text-[11px] hover:bg-vs-bg-hover transition-colors"
            >
              Reject
            </button>
            <button
              onClick={onApply}
              className="bg-vs-accent text-white font-medium rounded-md px-2.5 py-1 text-[11px] hover:opacity-90 transition-opacity"
            >
              Apply
            </button>
          </div>
        )}

        {patch.status === "applied" && (
          <div className="flex items-center gap-2">
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className="flex-none text-vs-success"
            >
              <path
                d="M3 6.5L5 8.5L9 3.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-vs-success text-[11px] font-mono">
              Applied, v{patch.versionFrom}&rarr;v{patch.versionTo}
            </span>
            <button
              onClick={onUndo}
              className="ml-auto border border-vs-border-strong text-vs-text-secondary rounded-md px-2 py-1 text-[11px] hover:bg-vs-bg-hover transition-colors"
            >
              Undo
            </button>
          </div>
        )}

        {patch.status === "rejected" && (
          <span className="text-vs-text-muted text-[11px] font-mono">
            Rejected &mdash; no changes applied
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Assistant Drawer (main export)                                    */
/* ------------------------------------------------------------------ */

export function AssistantDrawer() {
  const { close } = useAssistant();
  const { showToast } = useToast();

  const [messages, setMessages] = useState<Message[]>(createInitialMessages);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [draftingComplete, setDraftingComplete] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  /* Escape key closes drawer */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [close]);

  /* Auto-scroll on new messages */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, selectedChoice, draftingComplete]);

  /* Apply patch */
  const handleApply = useCallback(
    (msgId: number) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === msgId && m.role === "assistant" && m.patch) {
            return {
              ...m,
              patch: { ...m.patch, status: "applied" as const },
            };
          }
          return m;
        }),
      );
      showToast("Patch applied");
    },
    [showToast],
  );

  /* Reject patch */
  const handleReject = useCallback((msgId: number) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id === msgId && m.role === "assistant" && m.patch) {
          return {
            ...m,
            patch: { ...m.patch, status: "rejected" as const },
          };
        }
        return m;
      }),
    );
  }, []);

  /* Undo patch */
  const handleUndo = useCallback(
    (msgId: number) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === msgId && m.role === "assistant" && m.patch) {
            return {
              ...m,
              patch: { ...m.patch, status: "pending" as const },
            };
          }
          return m;
        }),
      );
      showToast("Patch undone");
    },
    [showToast],
  );

  /* Choose a chip */
  const handleChoice = useCallback(
    (choice: string) => {
      setSelectedChoice(choice);

      /* Simulate drafting then show patch */
      setTimeout(() => {
        setDraftingComplete(true);
        /* Add drafting message first, then convert to patch */
        const newId = messages.length + 10;
        setMessages((prev) => [
          ...prev,
          {
            id: newId,
            role: "assistant" as const,
            patch: {
              title: "Set border-radius to 12px on form components",
              renames: [
                {
                  from: "radius/button: 8px",
                  to: "radius/button: 12px",
                },
              ],
              visibleCount: 1,
              status: "pending" as const,
              versionFrom: 14,
              versionTo: 15,
            },
          },
        ]);
      }, 2000);
    },
    [messages.length],
  );

  /* Send input (no-op for prototype) */
  const handleSend = useCallback(() => {
    if (!inputValue.trim()) return;
    const newId = Date.now();
    setMessages((prev) => [
      ...prev,
      { id: newId, role: "user" as const, text: inputValue.trim() },
    ]);
    setInputValue("");
  }, [inputValue]);

  return (
    <div className="w-[400px] bg-vs-bg-surface border-l border-vs-border-default flex flex-col h-full flex-none">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-vs-border-default flex items-start justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-vs-text-primary">
            Assistant
          </h2>
          <p className="font-mono text-[11px] text-vs-text-muted mt-0.5">
            proposes changes, never applies them without you
          </p>
        </div>
        <button
          onClick={close}
          className="text-vs-text-muted hover:text-vs-text-primary transition-colors mt-0.5"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Message thread */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5"
      >
        {messages.map((msg) => {
          if (msg.role === "user") {
            return (
              <div key={msg.id} className="self-end max-w-[85%]">
                <div className="bg-vs-bg-elevated border border-vs-border-default rounded-lg px-3 py-2 text-[12px] text-vs-text-primary">
                  {msg.text}
                </div>
              </div>
            );
          }

          /* Assistant message */
          return (
            <div key={msg.id} className="max-w-[95%]">
              {msg.text && (
                <p className="text-[12px] text-vs-text-primary mb-2">
                  {msg.text}
                </p>
              )}

              {msg.patch && (
                <PatchCardView
                  patch={msg.patch}
                  onApply={() => handleApply(msg.id)}
                  onReject={() => handleReject(msg.id)}
                  onUndo={() => handleUndo(msg.id)}
                />
              )}

              {msg.choiceChips && !selectedChoice && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {msg.choiceChips.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => handleChoice(chip)}
                      className="border border-vs-border-strong rounded-full font-mono text-[11px] px-3 py-1.5 text-vs-text-secondary hover:border-vs-accent hover:text-vs-text-primary transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}

              {msg.choiceChips && selectedChoice && (
                <div className="mt-2">
                  <span className="inline-block border border-vs-accent rounded-full font-mono text-[11px] px-3 py-1.5 text-vs-accent">
                    {selectedChoice}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {/* Drafting skeleton (shows after choice but before patch arrives) */}
        {selectedChoice && !draftingComplete && (
          <div className="max-w-[95%]">
            <DraftingSkeleton />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="flex-none border-t border-vs-border-default p-3 flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder="Describe a change in English or Spanish\u2026"
          className="flex-1 bg-vs-bg-elevated border border-vs-border-default rounded-md text-[12px] text-vs-text-primary px-2.5 py-2 placeholder:text-vs-text-muted focus:border-vs-accent focus:outline-none transition-colors"
        />
        <button
          onClick={handleSend}
          className="w-[34px] h-[34px] bg-vs-accent rounded-md flex items-center justify-center text-white hover:opacity-90 transition-opacity flex-none"
        >
          <ArrowUpIcon />
        </button>
      </div>
    </div>
  );
}
