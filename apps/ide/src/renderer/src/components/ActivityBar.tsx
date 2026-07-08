import type { JSX } from "react";

/** The activities the left rail switches between. "explorer" is the code view
 *  (Explorer + editor + preview); the rest render a reused @vortspec/ui panel. */
export type ActivityKey = "explorer" | "source" | "tokens" | "tasks" | "manifest";

const ITEMS: { key: ActivityKey; label: string; icon: JSX.Element }[] = [
  {
    key: "explorer",
    label: "Explorer",
    icon: (
      <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h4l2 2.5h5A1.5 1.5 0 0 1 17 7v8.5A1.5 1.5 0 0 1 15.5 17h-11A1.5 1.5 0 0 1 3 15.5v-11Z" />
    ),
  },
  {
    key: "source",
    label: "Source Control",
    icon: (
      <path d="M6 3a2.5 2.5 0 0 0-1 4.79V12.2A2.5 2.5 0 1 0 7 12.2V9.9c.6.4 1.3.6 2 .6h1.2A2.5 2.5 0 1 0 12.5 8H11c-1.1 0-2-.9-2-2V4.79A2.5 2.5 0 0 0 6 3Z" />
    ),
  },
  {
    key: "tokens",
    label: "Design tokens",
    icon: <path d="M10 2 3 6v8l7 4 7-4V6l-7-4Zm0 2.3L14.7 7 10 9.7 5.3 7 10 4.3Z" />,
  },
  {
    key: "tasks",
    label: "Tasks",
    icon: (
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h9A1.5 1.5 0 0 1 16 4.5v11A1.5 1.5 0 0 1 14.5 17h-9A1.5 1.5 0 0 1 4 15.5v-11ZM7 7h6M7 10h6M7 13h4" />
    ),
  },
  {
    key: "manifest",
    label: "Design manifest",
    icon: (
      <path d="M6 3h5l3 3v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm5 0v3h3" />
    ),
  },
];

export function ActivityBar({
  active,
  onSelect,
  chatOpen,
  onToggleChat,
}: {
  active: ActivityKey;
  onSelect: (key: ActivityKey) => void;
  chatOpen: boolean;
  onToggleChat: () => void;
}): JSX.Element {
  return (
    <nav
      aria-label="Activity bar"
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-vs-border-default bg-vs-bg-surface py-2"
    >
      {ITEMS.map((item) => {
        const on = active === item.key;
        return (
          <button
            key={item.key}
            type="button"
            title={item.label}
            aria-label={item.label}
            aria-pressed={on}
            onClick={() => onSelect(item.key)}
            className={`relative flex h-10 w-10 items-center justify-center rounded-md transition-colors ${
              on ? "text-vs-text-primary" : "text-vs-text-muted hover:text-vs-text-secondary"
            }`}
          >
            {on && <span className="absolute left-0 top-1.5 h-7 w-0.5 rounded-r bg-vs-accent" />}
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {item.icon}
            </svg>
          </button>
        );
      })}
      <div className="mt-auto" />
      <button
        type="button"
        title="Assistant"
        aria-label="Toggle assistant"
        aria-pressed={chatOpen}
        onClick={onToggleChat}
        className={`flex h-10 w-10 items-center justify-center rounded-md transition-colors ${
          chatOpen ? "text-vs-accent" : "text-vs-text-muted hover:text-vs-text-secondary"
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H8l-3.5 3V13H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
        </svg>
      </button>
    </nav>
  );
}
