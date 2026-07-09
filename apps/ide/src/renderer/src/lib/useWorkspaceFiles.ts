import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@vortspec/ui/api";
import type { OpenFile } from "../components/EditorGroup";

/**
 * Owns the open-file/tab state for a workspace, lifted out of the editor so the
 * Explorer (left sidebar) and the editor area (center) are independent regions
 * that share it — the VS Code model. Files are read/written through the
 * workspace-root-guarded core handlers; the renderer never touches `fs`. Open
 * tabs survive switching the center between the editor and a panel, because the
 * state lives here (above both).
 */
export interface WorkspaceFiles {
  files: OpenFile[];
  activePath: string | null;
  setActivePath: (path: string | null) => void;
  openFile: (path: string) => Promise<void>;
  change: (path: string, value: string) => void;
  save: (path: string) => Promise<void>;
  close: (path: string) => void;
  reload: (path: string) => Promise<void>;
  /** Move `fromPath` before `toPath` in the tab strip (`toPath: null` = to the end). */
  reorder: (fromPath: string, toPath: string | null) => void;
}

export function useWorkspaceFiles(projectPath: string | null): WorkspaceFiles {
  const [files, setFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  // Reset when the workspace changes (or closes).
  useEffect(() => {
    setFiles([]);
    setActivePath(null);
  }, [projectPath]);

  const openFile = useCallback(
    async (path: string): Promise<void> => {
      if (!projectPath) return;
      if (filesRef.current.some((f) => f.path === path)) {
        setActivePath(path);
        return;
      }
      const file = await api.readFile(projectPath, path);
      if (file.truncated) return; // binary / too large — don't open in the text editor
      setFiles((prev) => [...prev, { path, content: file.content, dirty: false, staleOnDisk: false }]);
      setActivePath(path);
    },
    [projectPath],
  );

  const change = useCallback((path: string, value: string): void => {
    setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content: value, dirty: true } : f)));
  }, []);

  const save = useCallback(
    async (path: string): Promise<void> => {
      if (!projectPath) return;
      const file = filesRef.current.find((f) => f.path === path);
      if (!file) return;
      const res = await api.writeFile(projectPath, path, file.content);
      if (res.ok) {
        setFiles((prev) =>
          prev.map((f) => (f.path === path ? { ...f, dirty: false, staleOnDisk: false } : f)),
        );
      }
    },
    [projectPath],
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
      if (!projectPath) return;
      const file = await api.readFile(projectPath, path);
      setFiles((prev) =>
        prev.map((f) =>
          f.path === path ? { ...f, content: file.content, dirty: false, staleOnDisk: false } : f,
        ),
      );
    },
    [projectPath],
  );

  const reorder = useCallback((fromPath: string, toPath: string | null): void => {
    if (fromPath === toPath) return;
    setFiles((prev) => {
      const moved = prev.find((f) => f.path === fromPath);
      if (!moved) return prev;
      const without = prev.filter((f) => f.path !== fromPath);
      if (toPath === null) return [...without, moved];
      const to = without.findIndex((f) => f.path === toPath);
      if (to < 0) return prev;
      return [...without.slice(0, to), moved, ...without.slice(to)];
    });
  }, []);

  // Reconcile open files with on-disk changes: silently reload clean files,
  // flag dirty ones as stale (never clobber unsaved edits).
  useEffect(() => {
    if (!projectPath) return;
    const off = api.onWorkspaceChange((e) => {
      if (e.projectPath !== projectPath || !e.path) return;
      const open = filesRef.current.find((f) => f.path === e.path);
      if (!open) return;
      if (open.dirty) {
        setFiles((prev) => prev.map((f) => (f.path === e.path ? { ...f, staleOnDisk: true } : f)));
      } else {
        void reload(e.path);
      }
    });
    return () => off();
  }, [projectPath, reload]);

  return { files, activePath, setActivePath, openFile, change, save, close, reload, reorder };
}
