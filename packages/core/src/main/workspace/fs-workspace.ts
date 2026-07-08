import { promises as fsp, watch, type FSWatcher } from "node:fs";
import { resolve, sep } from "node:path";
import type { WebContents } from "electron";
import {
  WORKSPACE_CHANGE_CHANNEL,
  type FsEntry,
  type FsFile,
  type FsWriteResult,
} from "@vortspec/core/fs";

/**
 * Workspace-scoped filesystem access for the IDE. Every operation resolves
 * strictly inside the selected workspace root — a path that escapes the root
 * (via `..` or an absolute path) is rejected. This mirrors the safe-process
 * invariant: the app only ever touches files in the chosen project folder.
 */

/**
 * Resolve `rel` inside `root`, rejecting anything that escapes the root.
 * Pure + exported for unit testing. Returns the absolute path.
 */
export function resolveInside(root: string, rel: string): string {
  const rootAbs = resolve(root);
  const abs = resolve(rootAbs, rel);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + sep)) {
    throw new Error("Path escapes the workspace root.");
  }
  return abs;
}

/** Directories never shown in the Explorer (git internals are noise). */
const IGNORE = new Set([".git"]);
/** Files larger than this are treated as non-text (not read into the editor). */
const MAX_BYTES = 2_000_000;

function toPosix(rel: string): string {
  return rel.split(sep).join("/");
}

export async function listDir(root: string, rel: string): Promise<FsEntry[]> {
  const abs = resolveInside(root, rel);
  const dirents = await fsp.readdir(abs, { withFileTypes: true });
  const entries: FsEntry[] = [];
  for (const d of dirents) {
    if (rel === "" && IGNORE.has(d.name)) continue;
    const childRel = rel ? `${rel}/${d.name}` : d.name;
    entries.push({ name: d.name, path: childRel, type: d.isDirectory() ? "dir" : "file" });
  }
  entries.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1,
  );
  return entries;
}

export async function readFile(root: string, rel: string): Promise<FsFile> {
  const abs = resolveInside(root, rel);
  const stat = await fsp.stat(abs);
  // A directory isn't a text file — signal "not openable" instead of throwing
  // EISDIR (callers skip on `truncated`).
  if (stat.isDirectory()) return { path: rel, content: "", truncated: true };
  if (stat.size > MAX_BYTES) return { path: rel, content: "", truncated: true };
  const buf = await fsp.readFile(abs);
  // Treat a NUL byte as a binary marker — don't load it into the text editor.
  if (buf.includes(0)) return { path: rel, content: "", truncated: true };
  return { path: rel, content: buf.toString("utf8"), truncated: false };
}

export async function writeFile(root: string, rel: string, content: string): Promise<FsWriteResult> {
  try {
    const abs = resolveInside(root, rel);
    await fsp.writeFile(abs, content, "utf8");
    return { ok: true, message: "Saved." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not save the file." };
  }
}

// ── File watching ────────────────────────────────────────────────────
// One recursive watcher per workspace root, emitting coalesced change events.
// Recursive fs.watch is supported on macOS (the first target); if it isn't
// available the Explorer simply falls back to manual refresh.

const watchers = new Map<string, FSWatcher>();

export function startWatch(sender: WebContents, root: string): void {
  if (watchers.has(root)) return;
  try {
    const w = watch(root, { recursive: true }, (event, filename) => {
      if (!filename) {
        sender.send(WORKSPACE_CHANGE_CHANNEL, { projectPath: root, path: null, kind: "refresh" });
        return;
      }
      const rel = filename.toString();
      if (rel.split(sep)[0] === ".git") return; // ignore git internals
      sender.send(WORKSPACE_CHANGE_CHANNEL, {
        projectPath: root,
        path: toPosix(rel),
        kind: event === "rename" ? "add" : "change",
      });
    });
    watchers.set(root, w);
  } catch {
    // Recursive watching unsupported on this platform — no live updates, but
    // the Explorer's manual refresh still works.
  }
}

export function stopWatch(root: string): void {
  const w = watchers.get(root);
  if (w) {
    w.close();
    watchers.delete(root);
  }
}

export function stopAllWatchers(): void {
  for (const w of watchers.values()) w.close();
  watchers.clear();
}
