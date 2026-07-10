import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { Markdown } from "@vortspec/ui/Markdown";
import { CodeEditor, DiffView, type CodeSelection } from "./CodeEditor";

/** Files rendered as a stylized document (Markdown) rather than code. */
const MARKDOWN_RE = /\.(md|markdown|mdown|mkd)$/i;

/** Drag mime for reordering editor tabs — distinct from the chat-attach drag. */
const TAB_MIME = "application/vortspec-tab";

export interface OpenFile {
  path: string;
  content: string;
  dirty: boolean;
  /** true when the file changed on disk while it had unsaved edits. */
  staleOnDisk: boolean;
  /** "image" files render as a preview (data URL) instead of the code editor. */
  kind?: "text" | "image";
  /** For an image: its `data:` URL (null if it couldn't be inlined). */
  dataUrl?: string | null;
  /** For an image: too large to inline as a preview. */
  tooLarge?: boolean;
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
  relayoutKey,
  onSelection,
  onOpenInChat,
  onReorder,
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
  /** Bump to force an editor relayout when the container is shown/re-docked. */
  relayoutKey?: number;
  /** Reports the active editor selection up for assistant grounding. */
  onSelection?: (selection: CodeSelection | null) => void;
  /** "Open in Chat" — attach the selection to the assistant. */
  onOpenInChat?: (selection: CodeSelection) => void;
  /** Reorder the tabs: move `fromPath` before `toPath` (`null` = to the end). */
  onReorder?: (fromPath: string, toPath: string | null) => void;
}): JSX.Element {
  const active = files.find((f) => f.path === activePath) ?? null;
  const isImage = active?.kind === "image";
  const isMarkdown = !!active && !isImage && MARKDOWN_RE.test(active.path);
  const [diff, setDiff] = useState(false);
  const [head, setHead] = useState<string | null>(null);
  // Markdown files open in the stylized reading view by default; toggle to Source
  // to edit. Reset whenever the active file changes (see the effect below).
  const [mdPreview, setMdPreview] = useState(true);
  // Drag-to-reorder tabs: the dragged tab's path, and the tab we'd drop before.
  const dragTabRef = useRef<string | null>(null);
  const [dropBefore, setDropBefore] = useState<string | null>(null);

  // Reset the diff + markdown-preview view when the active file changes.
  useEffect(() => {
    setDiff(false);
    setHead(null);
    setMdPreview(true);
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
      {/* Tab bar — tabs are drag-reorderable within the strip. */}
      <div
        role="tablist"
        aria-label="Editor tabs"
        className="flex shrink-0 items-stretch overflow-x-auto border-b border-vs-border-default bg-vs-bg-surface"
        onDragOver={(e) => {
          // Allow dropping past the last tab → move to the end.
          if (onReorder && dragTabRef.current && e.dataTransfer.types.includes(TAB_MIME)) {
            e.preventDefault();
            setDropBefore("__end__");
          }
        }}
        onDrop={(e) => {
          const from = dragTabRef.current;
          dragTabRef.current = null;
          setDropBefore(null);
          if (onReorder && from && e.dataTransfer.types.includes(TAB_MIME)) {
            e.preventDefault();
            onReorder(from, null);
          }
        }}
      >
        {files.map((f) => {
          const name = f.path.slice(f.path.lastIndexOf("/") + 1);
          const on = f.path === activePath;
          return (
            <div
              key={f.path}
              role="tab"
              aria-selected={on}
              draggable={Boolean(onReorder)}
              onDragStart={(e) => {
                dragTabRef.current = f.path;
                e.dataTransfer.setData(TAB_MIME, f.path);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => {
                dragTabRef.current = null;
                setDropBefore(null);
              }}
              onDragOver={(e) => {
                if (!onReorder || !dragTabRef.current || dragTabRef.current === f.path) return;
                if (!e.dataTransfer.types.includes(TAB_MIME)) return;
                e.preventDefault();
                e.stopPropagation();
                setDropBefore(f.path);
              }}
              onDrop={(e) => {
                const from = dragTabRef.current;
                dragTabRef.current = null;
                setDropBefore(null);
                if (!onReorder || !from || !e.dataTransfer.types.includes(TAB_MIME)) return;
                e.preventDefault();
                e.stopPropagation();
                onReorder(from, f.path);
              }}
              className={`group flex items-center gap-2 border-r border-vs-border-default px-3 py-1.5 text-[13px] ${
                dropBefore === f.path ? "border-l-2 border-l-vs-accent" : ""
              } ${on ? "bg-vs-bg-code text-vs-text-primary" : "text-vs-text-secondary hover:bg-vs-bg-hover"}`}
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
        {dropBefore === "__end__" && <div className="w-0.5 self-stretch bg-vs-accent" aria-hidden />}
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
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-vs-border-subtle bg-vs-bg-surface px-3 py-1 text-[11px] text-vs-text-muted">
          <span className="truncate font-mono">{active.path}</span>
          <div className={`flex flex-none items-center gap-1 ${isImage ? "hidden" : ""}`}>
            {isMarkdown && !diff && (
              <button
                type="button"
                aria-pressed={mdPreview}
                onClick={() => setMdPreview((v) => !v)}
                title={mdPreview ? "Edit the raw Markdown" : "Show the stylized preview"}
                className={`rounded px-2 py-0.5 ${mdPreview ? "bg-vs-bg-elevated text-vs-text-primary" : "hover:text-vs-text-secondary"}`}
              >
                {mdPreview ? "Source" : "Preview"}
              </button>
            )}
            <button
              type="button"
              aria-pressed={diff}
              onClick={() => void toggleDiff()}
              className={`rounded px-2 py-0.5 ${diff ? "bg-vs-bg-elevated text-vs-text-primary" : "hover:text-vs-text-secondary"}`}
            >
              {diff ? "Editing" : "Diff vs HEAD"}
            </button>
          </div>
        </div>
      )}

      {/* Editor / preview — positioned so the absolute-filling editor gets a
          definite size regardless of the flexbox percentage-height quirk. */}
      <div className="relative min-h-0 flex-1">
        {active && isImage ? (
          <ImagePreview file={active} />
        ) : active && diff ? (
          <DiffView
            path={active.path}
            original={head ?? ""}
            modified={active.content}
            relayoutKey={relayoutKey}
          />
        ) : active && isMarkdown && mdPreview ? (
          // Stylized reading view (docs-like), scrollable, with a comfortable measure.
          <div className="absolute inset-0 overflow-y-auto bg-vs-bg-code">
            <div className="mx-auto max-w-3xl px-8 py-8 text-[14px] leading-relaxed text-vs-text-secondary">
              <Markdown text={active.content} />
            </div>
          </div>
        ) : active ? (
          <CodeEditor
            path={active.path}
            value={active.content}
            relayoutKey={relayoutKey}
            onChange={(v) => onChange(active.path, v)}
            onSelection={onSelection}
            onOpenInChat={onOpenInChat}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Preview an image file (PNG/JPEG/GIF/WebP/SVG/…) on a subtle checkerboard. */
function ImagePreview({ file }: { file: OpenFile }): JSX.Element {
  const name = file.path.slice(file.path.lastIndexOf("/") + 1);
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-auto p-8"
      style={{
        // A light/dark checkerboard so transparent images read clearly.
        backgroundImage:
          "linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.04) 75%), linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.04) 75%)",
        backgroundSize: "20px 20px",
        backgroundPosition: "0 0, 10px 10px",
      }}
    >
      {file.dataUrl ? (
        <>
          <img
            src={file.dataUrl}
            alt={name}
            className="max-h-full max-w-full rounded object-contain shadow-lg"
          />
          <span className="rounded bg-vs-bg-elevated px-2 py-0.5 font-mono text-[11px] text-vs-text-muted">{name}</span>
        </>
      ) : (
        <p className="text-sm text-vs-text-muted">
          {file.tooLarge ? "This image is too large to preview." : "Can’t preview this file."}
        </p>
      )}
    </div>
  );
}
