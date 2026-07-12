import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@vortspec/ui/api";
import type { OpenFile } from "../components/EditorGroup";

/** Image files open as a preview (data URL) rather than in the text editor. */
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i;

/** Idle delay before an edit is autosaved to disk. */
const AUTOSAVE_MS = 800;

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
  // Per-file debounce timers for autosave, and a ref to the latest `save` so the
  // stable `change` callback can trigger it without capturing a stale closure.
  const autosaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const saveRef = useRef<(path: string) => Promise<void>>(async () => undefined);

  // Reset when the workspace changes (or closes) — and clear pending autosaves.
  useEffect(() => {
    for (const t of autosaveTimers.current.values()) clearTimeout(t);
    autosaveTimers.current.clear();
    setFiles([]);
    setActivePath(null);
  }, [projectPath]);

  // Flush all pending autosave timers on unmount.
  useEffect(() => {
    const timers = autosaveTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const openFile = useCallback(
    async (path: string): Promise<void> => {
      if (!projectPath) return;
      if (filesRef.current.some((f) => f.path === path)) {
        setActivePath(path);
        return;
      }
      if (IMAGE_RE.test(path)) {
        // Images open as a preview (data URL), not in the text editor.
        const asset = await api.readAsset(projectPath, path);
        setFiles((prev) => [
          ...prev,
          { path, content: "", dirty: false, staleOnDisk: false, kind: "image", dataUrl: asset.dataUrl, tooLarge: asset.tooLarge },
        ]);
        setActivePath(path);
        return;
      }
      const file = await api.readFile(projectPath, path);
      if (file.truncated) return; // binary / too large — don't open in the text editor
      setFiles((prev) => [...prev, { path, content: file.content, dirty: false, staleOnDisk: false, kind: "text" }]);
      setActivePath(path);
    },
    [projectPath],
  );

  const change = useCallback((path: string, value: string): void => {
    setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content: value, dirty: true } : f)));
    // Debounced autosave-to-disk: reset the idle timer on every keystroke; when it
    // fires, save unless the file went stale (an external change must not be
    // clobbered — the stale banner asks the user to reconcile).
    const timers = autosaveTimers.current;
    const existing = timers.get(path);
    if (existing) clearTimeout(existing);
    timers.set(
      path,
      setTimeout(() => {
        timers.delete(path);
        const f = filesRef.current.find((x) => x.path === path);
        if (f && f.dirty && !f.staleOnDisk) void saveRef.current(path);
      }, AUTOSAVE_MS),
    );
  }, []);

  const save = useCallback(
    async (path: string): Promise<void> => {
      if (!projectPath) return;
      // A save supersedes any pending autosave for this file.
      const pending = autosaveTimers.current.get(path);
      if (pending) {
        clearTimeout(pending);
        autosaveTimers.current.delete(path);
      }
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
  saveRef.current = save;

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
      if (filesRef.current.find((f) => f.path === path)?.kind === "image") {
        const asset = await api.readAsset(projectPath, path);
        setFiles((prev) =>
          prev.map((f) => (f.path === path ? { ...f, dataUrl: asset.dataUrl, tooLarge: asset.tooLarge, staleOnDisk: false } : f)),
        );
        return;
      }
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
