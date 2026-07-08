import type { Project } from "../../../shared/ipc";
import { Logo } from "./Logo";

/**
 * The shared app-shell left rail (project header + Flow/Run/Preview/Tokens nav),
 * used by every project screen so the navigation lives in one place. Each screen
 * marks its own item `active` and wires the others.
 */
export interface RailItem {
  label: string;
  active?: boolean;
  badge?: React.ReactNode;
  onClick?: () => void;
}

/** The canonical project destinations, in order. `manifest` (DESIGN.md) is the final step. */
export type RailKey = "flow" | "run" | "playground" | "runapp" | "tokens" | "manifest" | "source" | "tasks" | "history";

export interface RailNav {
  onFlow: () => void;
  onRun: () => void;
  onPlayground: () => void;
  onTokens: () => void;
  onManifest: () => void;
  onHistory: () => void;
  /** Source Control (git) — optional; the item appears only where wired. */
  onSource?: () => void;
  /** Run App (live localhost runtime) — optional; appears only where wired. */
  onRunApp?: () => void;
  /** Tasks (Jira) — optional; appears only where wired. */
  onTasks?: () => void;
}

/**
 * Build the standard project rail — the same destinations on every screen, with
 * `active` marking the current one. Defined once here so the nav never drifts
 * between screens. `badges` lets a screen decorate an item (e.g. a review pill).
 */
export function projectRailItems(
  active: RailKey,
  nav: RailNav,
  badges?: Partial<Record<RailKey, React.ReactNode>>,
): RailItem[] {
  const defs: { key: RailKey; label: string; onClick: () => void }[] = [
    { key: "flow", label: "Flow", onClick: nav.onFlow },
    { key: "run", label: "Run", onClick: nav.onRun },
    { key: "playground", label: "Playground", onClick: nav.onPlayground },
    ...(nav.onRunApp ? [{ key: "runapp" as const, label: "Run app", onClick: nav.onRunApp }] : []),
    { key: "tokens", label: "Tokens", onClick: nav.onTokens },
    { key: "manifest", label: "Manifest", onClick: nav.onManifest },
    ...(nav.onSource ? [{ key: "source" as const, label: "Source Control", onClick: nav.onSource }] : []),
    ...(nav.onTasks ? [{ key: "tasks" as const, label: "Tasks (Jira)", onClick: nav.onTasks }] : []),
    { key: "history", label: "History", onClick: nav.onHistory },
  ];
  return defs.map((d) => ({
    label: d.label,
    active: d.key === active,
    // Keep the handler even when active: some screens (Verification, Review) mark
    // "Flow" active while living on their own screen, so clicking it must navigate.
    onClick: d.onClick,
    badge: badges?.[d.key],
  }));
}

export function ProjectRail({
  project,
  onHeaderClick,
  items,
}: {
  project: Project;
  /** Project header click — goes to the projects dashboard. */
  onHeaderClick: () => void;
  items: RailItem[];
}): React.JSX.Element {
  return (
    <nav className="flex w-52 shrink-0 flex-col border-r border-vs-border-default bg-vs-bg-surface p-3">
      <button
        onClick={onHeaderClick}
        title="All projects"
        className="mb-3 flex items-center gap-2 border-b border-vs-border-default px-2 pb-3 text-left hover:opacity-85"
      >
        <Logo size={20} className="shrink-0" />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold">{project.name}</span>
          <span className="block truncate font-mono text-[11px] text-vs-text-muted">
            {project.path}
          </span>
        </span>
      </button>
      <div className="flex flex-col gap-0.5">
        {items.map((it) => (
          <button
            key={it.label}
            onClick={it.onClick}
            className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] ${
              it.active
                ? "bg-vs-bg-elevated font-medium text-vs-accent"
                : "text-vs-text-secondary hover:bg-vs-bg-elevated hover:text-vs-text-primary"
            }`}
          >
            <span className="flex-1">{it.label}</span>
            {it.badge}
          </button>
        ))}
      </div>
    </nav>
  );
}

/** The amber "review" pill shown on the Flow item when a gate is pending. */
export function ReviewBadge(): React.JSX.Element {
  return (
    <span className="rounded-full border border-vs-warning-border px-1.5 font-mono text-[10px] text-vs-warning">
      review
    </span>
  );
}
