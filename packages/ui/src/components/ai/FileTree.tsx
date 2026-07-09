import { useEffect, useState } from "react";
import { ChevronRight, Folder, FolderOpen, File as FileIcon, Check, Plus } from "lucide-react";
import type { FsEntry } from "@vortspec/core/ipc";
import { cn } from "../../lib/cn";
import { Shimmer } from "./Shimmer";

/**
 * The shadcn/ai **File Tree** — a lazily-loaded, collapsible workspace tree.
 * Directories fetch their children on first expand (via the workspace-root-guarded
 * `loadDir`). When `onSelect` is supplied, each node is also selectable: click a
 * file or folder to add it as context (or remove it if already selected), so you
 * can pull an individual file out of an attached folder.
 */
export function FileTree({
  root,
  loadDir,
  onSelect,
  isSelected,
}: {
  root: string;
  loadDir: (path: string) => Promise<FsEntry[]>;
  onSelect?: (entry: FsEntry) => void;
  isSelected?: (path: string) => boolean;
}): React.JSX.Element {
  const [entries, setEntries] = useState<FsEntry[] | null>(null);
  useEffect(() => {
    let alive = true;
    void loadDir(root)
      .then((e) => alive && setEntries(e))
      .catch(() => alive && setEntries([]));
    return () => {
      alive = false;
    };
  }, [root, loadDir]);

  if (!entries) return <div className="px-2 py-1"><Shimmer bar /></div>;
  if (entries.length === 0) return <div className="px-2 py-1 text-[10px] text-vs-text-muted">Empty folder.</div>;
  return (
    <div className="max-h-52 overflow-auto py-1">
      {entries.map((e) => (
        <Node key={e.path} entry={e} depth={0} loadDir={loadDir} onSelect={onSelect} isSelected={isSelected} />
      ))}
    </div>
  );
}

function Node({
  entry,
  depth,
  loadDir,
  onSelect,
  isSelected,
}: {
  entry: FsEntry;
  depth: number;
  loadDir: (path: string) => Promise<FsEntry[]>;
  onSelect?: (entry: FsEntry) => void;
  isSelected?: (path: string) => boolean;
}): React.JSX.Element {
  const isDir = entry.type === "dir";
  const [open, setOpen] = useState(false);
  const [kids, setKids] = useState<FsEntry[] | null>(null);
  const selected = isSelected?.(entry.path) ?? false;
  async function toggle(): Promise<void> {
    if (!isDir) return;
    if (!open && kids === null) {
      try {
        setKids(await loadDir(entry.path));
      } catch {
        setKids([]);
      }
    }
    setOpen((v) => !v);
  }
  return (
    <>
      <div
        className={cn(
          "group flex items-center gap-1 px-1 py-[2px] text-[11px]",
          selected ? "bg-vs-accent-muted text-vs-text-primary" : "text-vs-text-secondary hover:bg-vs-bg-hover",
        )}
        style={{ paddingLeft: `${6 + depth * 12}px` }}
      >
        {/* Chevron toggles expand (folders only). */}
        <button type="button" onClick={() => void toggle()} className="w-3 shrink-0 text-vs-text-muted" aria-label={isDir ? "Expand" : undefined}>
          {isDir ? <ChevronRight size={11} className={open ? "rotate-90" : ""} /> : null}
        </button>
        {/* Name selects the entry (add/remove as context). */}
        <button
          type="button"
          onClick={() => onSelect?.(entry)}
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
          title={onSelect ? (selected ? "Remove from context" : "Add to context") : entry.path}
        >
          {isDir ? (
            open ? <FolderOpen size={12} className="text-vs-text-muted" /> : <Folder size={12} className="text-vs-text-muted" />
          ) : (
            <FileIcon size={12} className="text-vs-text-muted" />
          )}
          <span className="truncate font-mono">{entry.name}</span>
        </button>
        {onSelect && (
          <span className="shrink-0 pr-1 text-vs-text-muted">
            {selected ? <Check size={11} className="text-vs-accent" /> : <Plus size={11} className="opacity-0 group-hover:opacity-100" />}
          </span>
        )}
      </div>
      {open && kids?.map((k) => <Node key={k.path} entry={k} depth={depth + 1} loadDir={loadDir} onSelect={onSelect} isSelected={isSelected} />)}
    </>
  );
}
