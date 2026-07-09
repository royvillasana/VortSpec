import { useEffect, useState } from "react";
import { ChevronRight, Folder, FolderOpen, File as FileIcon } from "lucide-react";
import type { FsEntry } from "@vortspec/core/ipc";
import { Shimmer } from "./Shimmer";

/**
 * The shadcn/ai **File Tree** — a lazily-loaded, collapsible workspace tree.
 * Used to preview an attached `@folder`: each directory fetches its children the
 * first time it's expanded (via the injected `loadDir`, workspace-root-guarded in
 * the main process). Read-only; purely for showing what a folder contains.
 */
export function FileTree({
  root,
  loadDir,
}: {
  root: string;
  loadDir: (path: string) => Promise<FsEntry[]>;
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
        <Node key={e.path} entry={e} depth={0} loadDir={loadDir} />
      ))}
    </div>
  );
}

function Node({
  entry,
  depth,
  loadDir,
}: {
  entry: FsEntry;
  depth: number;
  loadDir: (path: string) => Promise<FsEntry[]>;
}): React.JSX.Element {
  const isDir = entry.type === "dir";
  const [open, setOpen] = useState(false);
  const [kids, setKids] = useState<FsEntry[] | null>(null);
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
      <button
        type="button"
        onClick={() => void toggle()}
        className="flex w-full items-center gap-1 px-1 py-[2px] text-left text-[11px] text-vs-text-secondary hover:bg-vs-bg-hover"
        style={{ paddingLeft: `${6 + depth * 12}px` }}
      >
        <span className="w-3 shrink-0 text-vs-text-muted">
          {isDir ? <ChevronRight size={11} className={open ? "rotate-90" : ""} /> : null}
        </span>
        {isDir ? (
          open ? <FolderOpen size={12} className="text-vs-text-muted" /> : <Folder size={12} className="text-vs-text-muted" />
        ) : (
          <FileIcon size={12} className="text-vs-text-muted" />
        )}
        <span className="truncate font-mono">{entry.name}</span>
      </button>
      {open && kids?.map((k) => <Node key={k.path} entry={k} depth={depth + 1} loadDir={loadDir} />)}
    </>
  );
}
