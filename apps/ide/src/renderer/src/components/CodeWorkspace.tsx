import { useCallback, useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import type { Project } from "@vortspec/core/ipc";
import { api } from "@vortspec/ui/api";
import { Explorer } from "./Explorer";
import { EditorGroup, type OpenFile } from "./EditorGroup";
import { PreviewPane } from "./PreviewPane";
import { useIde } from "../lib/ide-context";

/**
 * The "code" activity: Explorer (left) + editor group (top) + live-preview
 * placeholder (bottom). File contents are read/written through the
 * workspace-root-guarded core handlers; the renderer never touches `fs`. The
 * live preview arrives in I4.
 */
export function CodeWorkspace({ project }: { project: Project }): JSX.Element {
  const [files, setFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [layout, setLayout] = useState<"stacked" | "side">("stacked");
  const filesRef = useRef(files);
  filesRef.current = files;
  const { setActiveFile } = useIde();

  // Reset when the workspace changes.
  useEffect(() => {
    setFiles([]);
    setActivePath(null);
  }, [project.path]);

  // Publish the active file to the assistant's context (cleared when the code
  // activity unmounts).
  useEffect(() => {
    setActiveFile(activePath);
    return () => setActiveFile(null);
  }, [activePath, setActiveFile]);

  const openFile = useCallback(
    async (path: string): Promise<void> => {
      if (filesRef.current.some((f) => f.path === path)) {
        setActivePath(path);
        return;
      }
      const file = await api.readFile(project.path, path);
      if (file.truncated) return; // binary / too large — don't open in the text editor
      setFiles((prev) => [...prev, { path, content: file.content, dirty: false, staleOnDisk: false }]);
      setActivePath(path);
    },
    [project.path],
  );

  const change = useCallback((path: string, value: string): void => {
    setFiles((prev) =>
      prev.map((f) => (f.path === path ? { ...f, content: value, dirty: true } : f)),
    );
  }, []);

  const save = useCallback(
    async (path: string): Promise<void> => {
      const file = filesRef.current.find((f) => f.path === path);
      if (!file) return;
      const res = await api.writeFile(project.path, path, file.content);
      if (res.ok) {
        setFiles((prev) =>
          prev.map((f) => (f.path === path ? { ...f, dirty: false, staleOnDisk: false } : f)),
        );
      }
    },
    [project.path],
  );

  const close = useCallback((path: string): void => {
    setFiles((prev) => prev.filter((f) => f.path !== path));
    setActivePath((cur) => {
      if (cur !== path) return cur;
      const rest = filesRef.current.filter((f) => f.path !== path);
      return rest.length ? rest[rest.length - 1].path : null;
    });
  }, []);

  const reload = useCallback(
    async (path: string): Promise<void> => {
      const file = await api.readFile(project.path, path);
      setFiles((prev) =>
        prev.map((f) =>
          f.path === path ? { ...f, content: file.content, dirty: false, staleOnDisk: false } : f,
        ),
      );
    },
    [project.path],
  );

  // Reconcile open files with on-disk changes: silently reload clean files,
  // flag dirty ones as stale (never clobber unsaved edits).
  useEffect(() => {
    const off = api.onWorkspaceChange((e) => {
      if (e.projectPath !== project.path || !e.path) return;
      const open = filesRef.current.find((f) => f.path === e.path);
      if (!open) return;
      if (open.dirty) {
        setFiles((prev) => prev.map((f) => (f.path === e.path ? { ...f, staleOnDisk: true } : f)));
      } else {
        void reload(e.path);
      }
    });
    return () => off();
  }, [project.path, reload]);

  return (
    <div className="flex min-w-0 flex-1">
      <aside className="w-60 shrink-0 border-r border-vs-border-default bg-vs-bg-surface">
        <Explorer project={project} activePath={activePath} onOpen={(p) => void openFile(p)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Editor toolbar: layout + preview controls */}
        <div className="flex flex-none items-center justify-end gap-1 border-b border-vs-border-subtle bg-vs-bg-surface px-2 py-1 text-[11px] text-vs-text-muted">
          <button
            type="button"
            aria-pressed={layout === "side"}
            onClick={() => setLayout((l) => (l === "stacked" ? "side" : "stacked"))}
            className="rounded px-2 py-0.5 hover:text-vs-text-secondary"
            title="Toggle editor/preview layout"
          >
            {layout === "stacked" ? "Side-by-side" : "Stacked"}
          </button>
          <button
            type="button"
            aria-pressed={previewOpen}
            onClick={() => setPreviewOpen((v) => !v)}
            className={`rounded px-2 py-0.5 ${previewOpen ? "text-vs-text-primary" : "hover:text-vs-text-secondary"}`}
            title="Toggle live preview"
          >
            Preview
          </button>
        </div>

        <div className={`flex min-h-0 min-w-0 flex-1 ${layout === "side" ? "flex-row" : "flex-col"}`}>
          <div className="flex min-h-0 min-w-0 flex-1">
            <EditorGroup
              files={files}
              activePath={activePath}
              onActivate={setActivePath}
              onClose={close}
              onChange={change}
              onSave={(p) => void save(p)}
              onReload={(p) => void reload(p)}
              loadHead={(p) => api.fileAtHead(project.path, p)}
            />
          </div>
          {previewOpen && (
            <div
              className={
                layout === "side"
                  ? "min-h-0 w-1/2 shrink-0 border-l border-vs-border-default"
                  : "h-2/5 min-h-0 shrink-0 border-t border-vs-border-default"
              }
            >
              <PreviewPane project={project} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
