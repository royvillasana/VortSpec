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
  // Inline new-file/new-folder input under a parent dir ("" = root).
  const [creating, setCreating] = useState<{ parent: string; type: "file" | "dir" } | null>(null);
  // The path currently being renamed (inline input over the row).
  const [renaming, setRenaming] = useState<string | null>(null);
  // Right-click context menu.
  const [menu, setMenu] = useState<{ path: string; type: "file" | "dir"; x: number; y: number } | null>(null);
  // Folder highlighted as a drop target during a move.
  const [dragOver, setDragOver] = useState<string | null>(null);
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

  const dirOf = (path: string): string => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
  const baseOf = (path: string): string => path.split("/").pop() ?? path;

  function startCreate(parent: string, type: "file" | "dir"): void {
    setMenu(null);
    if (parent) setExpanded((p) => new Set(p).add(parent));
    setCreating({ parent, type });
  }

  async function commitCreate(name: string): Promise<void> {
    const c = creating;
    setCreating(null);
    const trimmed = name.trim();
    if (!c || !trimmed) return;
    const rel = c.parent ? `${c.parent}/${trimmed}` : trimmed;
    const res = c.type === "file" ? await api.createFile(project.path, rel) : await api.createDir(project.path, rel);
    if (res.ok && c.type === "file") onOpen(rel);
    // The fs watcher refreshes the tree.
  }

  async function commitRename(from: string, name: string): Promise<void> {
    setRenaming(null);
    const trimmed = name.trim();
    if (!trimmed || trimmed === baseOf(from)) return;
    const parent = dirOf(from);
    const to = parent ? `${parent}/${trimmed}` : trimmed;
    await api.renamePath(project.path, from, to);
  }

  async function move(from: string, toDir: string): Promise<void> {
    const to = toDir ? `${toDir}/${baseOf(from)}` : baseOf(from);
    // Don't move into itself, its own dir, or a descendant.
    if (from === to || dirOf(from) === toDir || toDir === from || toDir.startsWith(`${from}/`)) return;
    await api.renamePath(project.path, from, to);
  }

  /** Inline text input for create/rename. */
  function NameInput({ initial, depth, onCommit }: { initial: string; depth: number; onCommit: (v: string) => void }): JSX.Element {
    const [v, setV] = useState(initial);
    return (
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => onCommit(v)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit(v);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setCreating(null);
            setRenaming(null);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        style={{ marginLeft: `${6 + depth * 12}px` }}
        className="my-[1px] w-[calc(100%-8px)] rounded border border-vs-accent bg-vs-bg-primary px-1 py-[2px] text-[13px] text-vs-text-primary focus:outline-none"
      />
    );
  }

  function renderDir(rel: string, depth: number): JSX.Element[] {
    const entries = tree[rel] ?? [];
    const rows = entries.flatMap((entry) => {
      const isDir = entry.type === "dir";
      const open = expanded.has(entry.path);
      if (renaming === entry.path) {
        return [
          <NameInput key={entry.path} initial={entry.name} depth={depth} onCommit={(v) => void commitRename(entry.path, v)} />,
        ];
      }
      const row = (
        <button
          key={entry.path}
          type="button"
          aria-label={entry.name}
          draggable
          onDragStart={(e) => {
            // Same transfer powers both chat-attach and Explorer move.
            e.dataTransfer.setData(
              "application/vortspec-path",
              JSON.stringify({ path: entry.path, type: entry.type }),
            );
            e.dataTransfer.effectAllowed = "copyMove";
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ path: entry.path, type: entry.type, x: e.clientX, y: e.clientY });
          }}
          onDoubleClick={() => setRenaming(entry.path)}
          {...(isDir && {
            onDragOver: (e: React.DragEvent) => {
              if (e.dataTransfer.types.includes("application/vortspec-path")) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOver(entry.path);
              }
            },
            onDragLeave: () => setDragOver((d) => (d === entry.path ? null : d)),
            onDrop: (e: React.DragEvent) => {
              const raw = e.dataTransfer.getData("application/vortspec-path");
              setDragOver(null);
              if (!raw) return;
              e.preventDefault();
              e.stopPropagation();
              try {
                const { path } = JSON.parse(raw) as { path: string };
                void move(path, entry.path);
              } catch {
                /* ignore malformed */
              }
            },
          })}
          onClick={() => (isDir ? toggle(entry.path) : onOpen(entry.path))}
          className={`flex w-full items-center gap-1 rounded px-1.5 py-[3px] text-left text-[13px] transition-colors ${
            dragOver === entry.path
              ? "bg-vs-accent-muted text-vs-text-primary ring-1 ring-vs-accent"
              : activePath === entry.path
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
      const children = isDir && open ? renderDir(entry.path, depth + 1) : [];
      return [row, ...children];
    });
    // The inline "new file/folder" input sits at the top of its parent dir.
    if (creating && creating.parent === rel) {
      rows.unshift(
        <NameInput
          key={`__new-${rel}`}
          initial={creating.type === "dir" ? "" : ""}
          depth={depth + (rel ? 1 : 0)}
          onCommit={(v) => void commitCreate(v)}
        />,
      );
    }
    return rows;
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
            title="New File"
            aria-label="New File"
            onClick={() => startCreate("", "file")}
            className="text-vs-text-muted hover:text-vs-text-secondary"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 2.5H6A1.5 1.5 0 0 0 4.5 4v12A1.5 1.5 0 0 0 6 17.5h8a1.5 1.5 0 0 0 1.5-1.5V7L11 2.5Z" />
              <path d="M11 2.5V7h4.5M10 10v4M8 12h4" />
            </svg>
          </button>
          <button
            type="button"
            title="New Folder"
            aria-label="New Folder"
            onClick={() => startCreate("", "dir")}
            className="text-vs-text-muted hover:text-vs-text-secondary"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h3l1.5 2h6A1.5 1.5 0 0 1 16.5 8.5v5A1.5 1.5 0 0 1 15 15H4.5A1.5 1.5 0 0 1 3 13.5v-7Z" />
              <path d="M9.5 9.5v3M8 11h3" />
            </svg>
          </button>
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
      <div
        className="min-h-0 flex-1 overflow-auto px-1 pb-2"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("application/vortspec-path")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={(e) => {
          const raw = e.dataTransfer.getData("application/vortspec-path");
          if (!raw) return;
          try {
            const { path } = JSON.parse(raw) as { path: string };
            void move(path, "");
          } catch {
            /* ignore */
          }
        }}
      >
        {renderDir("", 0)}
      </div>

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div
            className="fixed z-50 min-w-[160px] rounded-md border border-vs-border-default bg-vs-bg-elevated py-1 text-xs shadow-xl"
            style={{ top: menu.y, left: menu.x }}
          >
            {menu.type === "dir" && (
              <>
                <MenuItem label="New File" onClick={() => startCreate(menu.path, "file")} />
                <MenuItem label="New Folder" onClick={() => startCreate(menu.path, "dir")} />
                <div className="my-1 border-t border-vs-border-subtle" />
              </>
            )}
            <MenuItem label="Rename" onClick={() => { setRenaming(menu.path); setMenu(null); }} />
            <MenuItem label="Reveal in Finder" onClick={() => { void api.revealPath(project.path, menu.path); setMenu(null); }} />
            <div className="my-1 border-t border-vs-border-subtle" />
            <MenuItem label="Delete" destructive onClick={() => { void api.trashPath(project.path, menu.path); setMenu(null); }} />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ label, onClick, destructive }: { label: string; onClick: () => void; destructive?: boolean }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left hover:bg-vs-bg-hover ${destructive ? "text-vs-error" : "text-vs-text-secondary"}`}
    >
      {label}
    </button>
  );
}
