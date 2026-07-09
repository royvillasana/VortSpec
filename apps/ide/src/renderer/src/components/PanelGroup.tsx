import type { JSX } from "react";
import type { Project } from "@vortspec/core/ipc";
import { Terminal } from "@vortspec/ui/Terminal";
import type { PanelTab, PanelDock } from "../lib/layout";

const LABEL: Record<PanelTab, string> = { terminal: "Terminal" };

/**
 * The bottom/side panel group — a tabbed container (Terminal now; extensible).
 * Open tabs stay mounted-but-hidden on switch so the terminal session survives;
 * closing a tab unmounts it (terminating the session). The dock (bottom/side)
 * and sizing are owned by the layout store; this renders the tabs + content.
 */
export function PanelGroup({
  project,
  tabs,
  selected,
  dock,
  onSelect,
  onClose,
  onToggleDock,
  onClosePanel,
}: {
  project: Project;
  tabs: PanelTab[];
  selected: PanelTab | null;
  dock: PanelDock;
  onSelect: (tab: PanelTab) => void;
  onClose: (tab: PanelTab) => void;
  onToggleDock: () => void;
  onClosePanel: () => void;
}): JSX.Element {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-vs-bg-code">
      <div className="flex flex-none items-center gap-1 border-b border-vs-border-default px-2 py-1 text-[11px] text-vs-text-muted">
        {tabs.map((t) => (
          <div
            key={t}
            className={`flex items-center gap-1 rounded px-1 ${
              selected === t ? "text-vs-text-primary" : ""
            }`}
          >
            <button
              type="button"
              aria-pressed={selected === t}
              onClick={() => onSelect(t)}
              className={`px-1.5 py-0.5 uppercase tracking-wide ${
                selected === t ? "" : "hover:text-vs-text-secondary"
              }`}
            >
              {LABEL[t]}
            </button>
            <button
              type="button"
              aria-label={`Close ${LABEL[t]}`}
              onClick={() => onClose(t)}
              className="px-0.5 hover:text-vs-text-secondary"
            >
              ✕
            </button>
          </div>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          aria-label={dock === "bottom" ? "Move panel to the side" : "Move panel to the bottom"}
          title={dock === "bottom" ? "Move panel to the side" : "Move panel to the bottom"}
          onClick={onToggleDock}
          className="px-1.5 py-0.5 hover:text-vs-text-secondary"
        >
          {dock === "bottom" ? "⇥" : "⤓"}
        </button>
        <button
          type="button"
          aria-label="Close panel"
          title="Close panel"
          onClick={onClosePanel}
          className="px-1.5 py-0.5 hover:text-vs-text-secondary"
        >
          ✕
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        {tabs.map((t) => (
          <div key={t} className={`absolute inset-0 ${selected === t ? "" : "hidden"}`}>
            {t === "terminal" && <Terminal project={project} />}
          </div>
        ))}
      </div>
    </div>
  );
}
