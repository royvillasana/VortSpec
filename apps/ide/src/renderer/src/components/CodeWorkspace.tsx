import type { JSX } from "react";
import type { Project } from "@vortspec/core/ipc";
import { api } from "@vortspec/ui/api";

/**
 * The "code" activity: Explorer (left) + editor (top) + live preview (bottom).
 * These are scaffolded placeholders in I1 — the Monaco editor + real file tree
 * land in I2, and the live preview in I4. Each placeholder names the milestone
 * that fills it in, and offers the raw-form escape hatch (reveal in Finder).
 */
export function CodeWorkspace({ project }: { project: Project }): JSX.Element {
  return (
    <div className="flex min-w-0 flex-1">
      {/* Explorer */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-vs-border-default bg-vs-bg-surface">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-vs-text-muted">
            Explorer
          </span>
          <button
            type="button"
            title="Reveal in Finder"
            onClick={() => void api.revealPath(project.path, ".")}
            className="text-vs-text-muted hover:text-vs-text-secondary"
          >
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h3l1.5 2h6A1.5 1.5 0 0 1 16.5 8.5v5A1.5 1.5 0 0 1 15 15H4.5A1.5 1.5 0 0 1 3 13.5v-7Z" />
            </svg>
          </button>
        </div>
        <div className="px-3 pb-2 text-sm text-vs-text-primary">{project.name}</div>
        <div className="mx-3 rounded-md border border-dashed border-vs-border-default p-3 text-xs text-vs-text-muted">
          The file tree and Monaco editor arrive in I2. For now, open files from
          your terminal or reveal the folder above.
        </div>
      </aside>

      {/* Editor + preview split */}
      <div className="flex min-w-0 flex-1 flex-col">
        <section className="flex flex-1 items-center justify-center border-b border-vs-border-default bg-vs-bg-code">
          <div className="max-w-sm text-center">
            <p className="text-sm text-vs-text-secondary">Editor</p>
            <p className="mt-1 text-xs text-vs-text-muted">
              Monaco (VS Code's editor engine) mounts here in I2 — open, edit, and
              diff files scoped to the workspace.
            </p>
          </div>
        </section>
        <section className="flex h-2/5 items-center justify-center bg-vs-bg-primary">
          <div className="max-w-sm text-center">
            <p className="text-sm text-vs-text-secondary">Live preview</p>
            <p className="mt-1 text-xs text-vs-text-muted">
              The running app / Storybook embeds here in I4 — screens on one side,
              code on the other.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
