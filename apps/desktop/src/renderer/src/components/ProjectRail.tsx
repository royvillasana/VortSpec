import type { Project } from "../../../shared/ipc";

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
        <span className="grid h-5 w-5 place-items-center rounded-md bg-vs-accent font-mono text-[11px] font-medium text-vs-bg-primary">
          {project.name.charAt(0).toUpperCase()}
        </span>
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
