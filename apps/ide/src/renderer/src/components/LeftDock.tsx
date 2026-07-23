import type { JSX, ReactNode } from "react";

/**
 * The single left sidebar (change: unified-left-dock). Replaces the old two-sidebar
 * layout (primary Explorer + right assistant) with ONE resizable left panel that has two
 * tabs:
 *   - **Section** — the current view's own sidebar, portaled in by the view (an empty
 *     slot div this component owns; the host renders into it). Hidden when a full-center
 *     view has no sidebar.
 *   - **Chat** — the assistant, mounted ONCE here (never unmounted when you switch the
 *     tab or the section), so the conversation + its context persist across the whole app.
 *
 * Both tab bodies stay mounted; the inactive one is just hidden, so portaled section
 * content and the chat keep their state.
 */
export function LeftDock({
  width,
  sectionLabel,
  hasSection,
  onSectionSlot,
  tab,
  onTabChange,
  chat,
}: {
  width: number;
  /** Tab label for the section sidebar (e.g. "Explorer", "Design", "Flow"). */
  sectionLabel: string;
  /** Whether the current view contributes a section sidebar (else only Chat shows). */
  hasSection: boolean;
  /** Receives the section tab's slot element — the host portals the view's sidebar in. */
  onSectionSlot: (el: HTMLDivElement | null) => void;
  /** Controlled active tab (so the host can reveal Chat, e.g. on "send to chat"). */
  tab: "section" | "chat";
  onTabChange: (tab: "section" | "chat") => void;
  /** The assistant, mounted here once (persistent across sections). */
  chat: ReactNode;
}): JSX.Element {
  const active = hasSection ? tab : "chat";

  return (
    <aside
      style={{ width }}
      className="flex shrink-0 flex-col overflow-hidden border-r border-vs-border-default bg-vs-bg-surface"
    >
      <div className="flex flex-none items-stretch border-b border-vs-border-subtle text-[12px]">
        {hasSection && (
          <TabBtn active={active === "section"} onClick={() => onTabChange("section")}>
            {sectionLabel}
          </TabBtn>
        )}
        <TabBtn active={active === "chat"} onClick={() => onTabChange("chat")}>
          Chat
        </TabBtn>
      </div>

      {/* Section slot — the host portals the current view's sidebar here. */}
      <div
        ref={onSectionSlot}
        className={`min-h-0 flex-1 flex-col overflow-auto ${active === "section" ? "flex" : "hidden"}`}
      />
      {/* Chat — always mounted (only hidden), so its conversation persists everywhere. */}
      <div className={`min-h-0 flex-1 flex-col ${active === "chat" ? "flex" : "hidden"}`}>{chat}</div>
    </aside>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 border-b-2 px-3 py-2 font-medium capitalize transition-colors ${
        active
          ? "border-vs-accent text-vs-text-primary"
          : "border-transparent text-vs-text-muted hover:text-vs-text-secondary"
      }`}
    >
      {children}
    </button>
  );
}
