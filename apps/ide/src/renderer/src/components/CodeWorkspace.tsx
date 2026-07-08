import { useCallback, useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import type { Project } from "@vortspec/core/ipc";
import { api } from "@vortspec/ui/api";
import { Explorer } from "./Explorer";
import { EditorGroup, type OpenFile } from "./EditorGroup";

/**
 * The "code" activity: Explorer (left) + editor group (top) + live-preview
 * placeholder (bottom). File contents are read/written through the
 * workspace-root-guarded core handlers; the renderer never touches `fs`. The
 * live preview arrives in I4.
 */
export function CodeWorkspace({ project }: { project: Project }): JSX.Element {
  const [files, setFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  // Reset when the workspace changes.
  useEffect(() => {
    setFiles([]);
    setActivePath(null);
  }, [project.path]);

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
        <section className="flex h-2/5 items-center justify-center border-t border-vs-border-default bg-vs-bg-primary">
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
