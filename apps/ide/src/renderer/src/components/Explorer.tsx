import { useCallback, useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import type { Project, FsEntry } from "@vortspec/core/ipc";
import { api } from "@vortspec/ui/api";
import { FileIcon } from "./FileIcon";

/**
 * A lazy file-tree Explorer for the workspace. Directories load their children
 * on first expand (via the workspace-root-guarded core handler); a filesystem
 * watch refreshes any already-loaded directory when files change on disk (e.g.
 * an agent run wrote a file).
 */
export function Explorer({
  project,
  activePath,
  onOpen,
  onCollapse,
}: {
  project: Project;
  activePath: string | null;
  onOpen: (path: string) => void;
  /** Collapse the whole Explorer sidebar (shown as a header chevron). */
  onCollapse?: () => void;
}): JSX.Element {
  const [tree, setTree] = useState<Record<string, FsEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set([""]));
  const treeRef = useRef(tree);
  treeRef.current = tree;

  const loadDir = useCallback(
    async (rel: string): Promise<void> => {
      const entries = await api.listDir(project.path, rel);
      setTree((t) => ({ ...t, [rel]: entries }));
    },
    [project.path],
  );

  // Load the root and start watching; refresh loaded dirs on change.
  useEffect(() => {
    setTree({});
    setExpanded(new Set([""]));
    void loadDir("");
    void api.watchWorkspace(project.path);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = api.onWorkspaceChange((e) => {
      if (e.projectPath !== project.path) return;
      // Coalesce bursts, then re-read every directory we've already loaded.
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        for (const rel of Object.keys(treeRef.current)) void loadDir(rel);
      }, 150);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
      void api.unwatchWorkspace(project.path);
    };
  }, [project.path, loadDir]);

  function toggle(dir: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) {
        next.delete(dir);
      } else {
        next.add(dir);
        if (!treeRef.current[dir]) void loadDir(dir);
      }
      return next;
    });
  }

  function renderDir(rel: string, depth: number): JSX.Element[] {
    const entries = tree[rel] ?? [];
    return entries.flatMap((entry) => {
      const isDir = entry.type === "dir";
      const open = expanded.has(entry.path);
      const row = (
        <button
          key={entry.path}
          type="button"
          aria-label={entry.name}
          onClick={() => (isDir ? toggle(entry.path) : onOpen(entry.path))}
          className={`flex w-full items-center gap-1 rounded px-1.5 py-[3px] text-left text-[13px] transition-colors ${
            activePath === entry.path
              ? "bg-vs-bg-elevated text-vs-text-primary"
              : "text-vs-text-secondary hover:bg-vs-bg-hover"
          }`}
          style={{ paddingLeft: `${6 + depth * 12}px` }}
        >
          <span className="w-3 shrink-0 text-[10px] text-vs-text-muted">
            {isDir ? (open ? "▾" : "▸") : ""}
          </span>
          <FileIcon name={entry.name} isDir={isDir} open={open} />
          <span className="truncate">{entry.name}</span>
        </button>
      );
      return isDir && open ? [row, ...renderDir(entry.path, depth + 1)] : [row];
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-vs-text-muted">
          Explorer
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Refresh"
            onClick={() => {
              for (const rel of Object.keys(treeRef.current)) void loadDir(rel);
            }}
            className="text-vs-text-muted hover:text-vs-text-secondary"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15.5 5.5A6 6 0 1 0 16 10M15.5 5.5V3m0 2.5H13" />
            </svg>
          </button>
          <button
            type="button"
            title="Reveal in Finder"
            onClick={() => void api.revealPath(project.path, ".")}
            className="text-vs-text-muted hover:text-vs-text-secondary"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h3l1.5 2h6A1.5 1.5 0 0 1 16.5 8.5v5A1.5 1.5 0 0 1 15 15H4.5A1.5 1.5 0 0 1 3 13.5v-7Z" />
            </svg>
          </button>
          {onCollapse && (
            <button
              type="button"
              aria-label="Collapse Explorer"
              title="Collapse Explorer"
              onClick={onCollapse}
              className="text-vs-text-muted hover:text-vs-text-secondary"
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5l-4 5 4 5" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">{renderDir("", 0)}</div>
    </div>
  );
}
