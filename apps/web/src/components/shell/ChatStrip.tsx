"use client";

import { useAssistant } from "@/components/inspector/AssistantContext";

const ChatBubbleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect
      x="2"
      y="3"
      width="12"
      height="9"
      rx="3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <path
      d="M6 12 L6 14.5 L9 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

export function ChatStrip() {
  const { toggle } = useAssistant();

  return (
    <aside className="flex-none w-12 bg-vs-bg-surface border-l border-vs-border-default flex flex-col items-center pt-3">
      <button
        onClick={toggle}
        className="w-8 h-8 rounded-md flex items-center justify-center text-vs-text-secondary hover:bg-vs-bg-elevated hover:text-vs-text-primary transition-colors"
        title="Open assistant"
      >
        <ChatBubbleIcon />
      </button>
    </aside>
  );
}
