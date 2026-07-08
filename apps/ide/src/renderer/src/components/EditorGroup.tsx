import { useEffect, useState } from "react";
import type { JSX } from "react";
import { CodeEditor, DiffView } from "./CodeEditor";

export interface OpenFile {
  path: string;
  content: string;
  dirty: boolean;
  /** true when the file changed on disk while it had unsaved edits. */
  staleOnDisk: boolean;
}

/**
 * The editor group: a tab bar of open files (with dirty markers) over a Monaco
 * editor bound to the active file. Cmd/Ctrl-S saves. If a file changes on disk
 * while dirty, a non-destructive "reload" banner is shown rather than clobbering
 * the user's edits.
 */
export function EditorGroup({
  files,
  activePath,
  onActivate,
  onClose,
  onChange,
  onSave,
  onReload,
  loadHead,
}: {
  files: OpenFile[];
  activePath: string | null;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
  onChange: (path: string, value: string) => void;
  onSave: (path: string) => void;
  onReload: (path: string) => void;
  /** Fetch the file's committed contents at HEAD (null when untracked). */
  loadHead: (path: string) => Promise<string | null>;
}): JSX.Element {
  const active = files.find((f) => f.path === activePath) ?? null;
  const [diff, setDiff] = useState(false);
  const [head, setHead] = useState<string | null>(null);

  // Reset the diff view when the active file changes.
  useEffect(() => {
    setDiff(false);
    setHead(null);
  }, [activePath]);

  async function toggleDiff(): Promise<void> {
    if (diff) {
      setDiff(false);
      return;
    }
    if (active) {
      setHead(await loadHead(active.path));
      setDiff(true);
    }
  }

  // Cmd/Ctrl-S saves the active file.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (active?.dirty) onSave(active.path);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onSave]);

  if (files.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center bg-vs-bg-code">
        <div className="max-w-sm text-center">
          <p className="text-sm text-vs-text-secondary">No file open</p>
          <p className="mt-1 text-xs text-vs-text-muted">
            Pick a file in the Explorer to edit it here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-vs-bg-code">
      {/* Tab bar */}
      <div role="tablist" className="flex shrink-0 items-stretch overflow-x-auto border-b border-vs-border-default bg-vs-bg-surface">
        {files.map((f) => {
          const name = f.path.slice(f.path.lastIndexOf("/") + 1);
          const on = f.path === activePath;
          return (
            <div
              key={f.path}
              role="tab"
              aria-selected={on}
              className={`group flex items-center gap-2 border-r border-vs-border-default px-3 py-1.5 text-[13px] ${
                on ? "bg-vs-bg-code text-vs-text-primary" : "text-vs-text-secondary hover:bg-vs-bg-hover"
              }`}
            >
              <button type="button" onClick={() => onActivate(f.path)} className="flex items-center gap-1.5">
                <span className="truncate">{name}</span>
                {f.dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-vs-text-secondary" aria-label="unsaved" />}
              </button>
              <button
                type="button"
                aria-label={`Close ${name}`}
                onClick={() => onClose(f.path)}
                className="text-vs-text-muted opacity-0 transition-opacity hover:text-vs-text-primary group-hover:opacity-100"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      {/* Stale-on-disk banner (non-destructive) */}
      {active?.staleOnDisk && (
        <div className="flex items-center justify-between gap-3 border-b border-vs-warning-border bg-vs-warning-muted px-3 py-1.5 text-xs text-vs-warning">
          <span>This file changed on disk while you have unsaved edits.</span>
          <button
            type="button"
            onClick={() => onReload(active.path)}
            className="rounded border border-vs-warning-border px-2 py-0.5 hover:bg-vs-warning/10"
          >
            Reload from disk
          </button>
        </div>
      )}

      {/* Editor toolbar: path + Edit/Diff toggle */}
      {active && (
        <div className="flex shrink-0 items-center justify-between border-b border-vs-border-subtle bg-vs-bg-surface px-3 py-1 text-[11px] text-vs-text-muted">
          <span className="truncate font-mono">{active.path}</span>
          <button
            type="button"
            aria-pressed={diff}
            onClick={() => void toggleDiff()}
            className={`rounded px-2 py-0.5 ${diff ? "bg-vs-bg-elevated text-vs-text-primary" : "hover:text-vs-text-secondary"}`}
          >
            {diff ? "Editing" : "Diff vs HEAD"}
          </button>
        </div>
      )}

      {/* Editor / diff */}
      <div className="min-h-0 flex-1">
        {active && diff ? (
          <DiffView path={active.path} original={head ?? ""} modified={active.content} />
        ) : active ? (
          <CodeEditor
            path={active.path}
            value={active.content}
            onChange={(v) => onChange(active.path, v)}
          />
        ) : null}
      </div>
    </div>
  );
}
