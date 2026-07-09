import { useRef, useState } from "react";
import type { Project } from "@vortspec/core/ipc";
import type { ChatMessage } from "@vortspec/ui/run-model";
import { AssistantDock, type PendingSelectionRef } from "./AssistantDock";
import { DEFAULT_PRESETS, type Agent } from "./ai/agents";

/**
 * Multiple assistant conversations as tabs. Each tab is an independent
 * `AssistantDock` (its own Claude session + transcript + agent). Inactive tabs
 * stay **mounted but hidden** (`hidden`), so their session/transcript survive
 * switching. New / rename (double-click) / close, capped at {@link MAX}. The
 * cockpit keeps using a single `AssistantDock` directly — this is the IDE's
 * tabbed view.
 */
const MAX = 8;

interface Conv {
  id: string;
  label: string;
  agent: Agent;
}

export function ConversationTabs({
  project,
  presets = DEFAULT_PRESETS,
  pendingRef,
  onClose,
  ...shared
}: {
  project: Project;
  presets?: Agent[];
  pendingRef?: PendingSelectionRef;
  onClose?: () => void;
  seedContext?: string;
  liveContext?: string;
  mcpConfigPath?: string;
  extraAllowedTools?: string[];
  userName?: string;
  showSession?: boolean;
  allowModify?: boolean;
}): React.JSX.Element {
  const [convs, setConvs] = useState<Conv[]>([{ id: "c1", label: "Conversation 1", agent: presets[0] }]);
  const [active, setActive] = useState("c1");
  const [renaming, setRenaming] = useState<string | null>(null);
  const seq = useRef(2);
  // Each conversation's committed transcript (for cross-conversation @-references).
  const [transcripts, setTranscripts] = useState<Record<string, ChatMessage[]>>({});
  // A highlighted selection routed into a conversation ("Send to"), keyed by target.
  const [incoming, setIncoming] = useState<Record<string, { text: string; from: string; nonce: number }>>({});

  function sendSelectionTo(targetId: string, text: string, from: string): void {
    setIncoming((prev) => ({ ...prev, [targetId]: { text, from, nonce: (prev[targetId]?.nonce ?? 0) + 1 } }));
    setActive(targetId); // reveal the target so the user sees the handed-off context
  }

  function addConv(): void {
    if (convs.length >= MAX) return;
    const id = `c${seq.current++}`;
    setConvs((cs) => [...cs, { id, label: `Conversation ${cs.length + 1}`, agent: presets[0] }]);
    setActive(id);
  }

  function closeConv(id: string): void {
    setConvs((cs) => {
      if (cs.length <= 1) return cs; // keep at least one conversation
      const rest = cs.filter((c) => c.id !== id);
      if (id === active) setActive(rest[rest.length - 1].id);
      return rest;
    });
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-vs-bg-surface">
      {/* Conversation tab strip */}
      <div role="tablist" aria-label="Conversations" className="flex shrink-0 items-stretch overflow-x-auto border-b border-vs-border-default bg-vs-bg-surface">
        {convs.map((c) => {
          const on = c.id === active;
          return (
            <div
              key={c.id}
              role="tab"
              aria-selected={on}
              className={`group flex items-center gap-1.5 border-r border-vs-border-default px-3 py-1.5 text-[12px] ${
                on ? "bg-vs-bg-elevated text-vs-text-primary" : "text-vs-text-secondary hover:bg-vs-bg-hover"
              }`}
            >
              {renaming === c.id ? (
                <TabRename
                  initial={c.label}
                  onCommit={(v) => {
                    const label = v.trim();
                    if (label) setConvs((cs) => cs.map((x) => (x.id === c.id ? { ...x, label } : x)));
                    setRenaming(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setActive(c.id)}
                  onDoubleClick={() => setRenaming(c.id)}
                  title="Double-click to rename"
                  className="max-w-[12rem] truncate"
                >
                  {c.label}
                </button>
              )}
              {convs.length > 1 && (
                <button
                  type="button"
                  aria-label={`Close ${c.label}`}
                  onClick={() => closeConv(c.id)}
                  className="text-vs-text-muted opacity-0 transition-opacity hover:text-vs-text-primary group-hover:opacity-100"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          aria-label="New conversation"
          title={convs.length >= MAX ? `Up to ${MAX} conversations` : "New conversation"}
          onClick={addConv}
          disabled={convs.length >= MAX}
          className="px-3 text-vs-text-muted hover:text-vs-text-primary disabled:opacity-40"
        >
          ＋
        </button>
        <div className="flex-1" />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="Close assistant"
            className="px-3 leading-none text-vs-text-muted hover:text-vs-text-primary"
          >
            ×
          </button>
        )}
      </div>

      {/* Every conversation stays mounted; only the active one is visible. */}
      <div className="relative min-h-0 flex-1">
        {convs.map((c) => (
          <div
            key={c.id}
            data-testid={c.id === active ? "active-conversation" : undefined}
            className={c.id === active ? "flex h-full" : "hidden"}
          >
            <AssistantDock
              {...shared}
              project={project}
              fill
              agent={c.agent}
              presets={presets}
              onAgentChange={(a) => setConvs((cs) => cs.map((x) => (x.id === c.id ? { ...x, agent: a } : x)))}
              pendingRef={c.id === active ? pendingRef : undefined}
              onTranscript={(msgs) => setTranscripts((t) => ({ ...t, [c.id]: msgs }))}
              conversations={{
                list: () => convs.filter((x) => x.id !== c.id).map((x) => ({ id: x.id, label: x.label })),
                transcript: (id) => transcripts[id] ?? [],
              }}
              incomingText={incoming[c.id]}
              onSendSelection={(targetId, text) => sendSelectionTo(targetId, text, c.label)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Inline tab-label rename input (Enter/blur commits, Escape cancels once). */
function TabRename({ initial, onCommit }: { initial: string; onCommit: (v: string) => void }): React.JSX.Element {
  const [v, setV] = useState(initial);
  const done = useRef(false);
  const commit = (val: string): void => {
    if (done.current) return;
    done.current = true;
    onCommit(val);
  };
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => commit(v)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(v);
        } else if (e.key === "Escape") {
          e.preventDefault();
          commit(initial);
        }
      }}
      className="w-28 rounded border border-vs-accent bg-vs-bg-primary px-1 py-0.5 text-[12px] text-vs-text-primary focus:outline-none"
    />
  );
}
