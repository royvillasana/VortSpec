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

/** Directories skipped when searching for `@`-mentions (build noise/vendored). */
const SEARCH_SKIP = new Set([".git", "node_modules", "dist", "out", "build", ".next", ".turbo", ".cache", "coverage"]);

/**
 * Walk the workspace and return files + folders whose relative path matches
 * `query` (case-insensitive substring, or every char in order for a fuzzy feel).
 * Powers the composer's `@`-mention picker. Bounded: caps the result count and
 * the number of directories visited so a huge tree can't stall the UI.
 */
export async function searchFiles(root: string, query: string, limit = 30): Promise<FsEntry[]> {
  const q = query.toLowerCase();
  const matches = (rel: string): boolean => {
    if (!q) return true;
    const hay = rel.toLowerCase();
    if (hay.includes(q)) return true;
    // Subsequence match (e.g. "btncss" → "components/Button.css").
    let i = 0;
    for (const ch of hay) if (ch === q[i]) i++;
    return i === q.length;
  };
  const results: FsEntry[] = [];
  let visited = 0;
  const MAX_DIRS = 4000;

  async function walk(rel: string): Promise<void> {
    if (results.length >= limit || visited >= MAX_DIRS) return;
    visited++;
    let dirents;
    try {
      dirents = await fsp.readdir(resolveInside(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    // Sort so files/dirs list stably; shallow entries surface first.
    dirents.sort((a, b) => a.name.localeCompare(b.name));
    for (const d of dirents) {
      if (results.length >= limit) return;
      if (d.name.startsWith(".") && rel === "") {
        if (SEARCH_SKIP.has(d.name)) continue;
      }
      if (SEARCH_SKIP.has(d.name)) continue;
      const childRel = rel ? `${rel}/${d.name}` : d.name;
      const isDir = d.isDirectory();
      if (matches(childRel)) {
        results.push({ name: d.name, path: childRel, type: isDir ? "dir" : "file" });
      }
      if (isDir) await walk(childRel);
    }
  }

  await walk("");
  // Shorter paths first — usually the more relevant match.
  results.sort((a, b) => a.path.length - b.path.length);
  return results.slice(0, limit);
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

/** Create an empty file at `rel` (creating parent dirs). Fails if it exists. */
export async function createFile(root: string, rel: string): Promise<FsWriteResult> {
  try {
    const abs = resolveInside(root, rel);
    await fsp.mkdir(resolve(abs, ".."), { recursive: true });
    // Exclusive flag → error if the path already exists (don't clobber).
    const fh = await fsp.open(abs, "wx");
    await fh.close();
    return { ok: true, message: "Created." };
  } catch (err) {
    const msg = err instanceof Error && "code" in err && err.code === "EEXIST" ? "That file already exists." : err instanceof Error ? err.message : "Could not create the file.";
    return { ok: false, message: msg };
  }
}

/** Create a directory at `rel` (recursively). */
export async function createDir(root: string, rel: string): Promise<FsWriteResult> {
  try {
    const abs = resolveInside(root, rel);
    await fsp.mkdir(abs, { recursive: true });
    return { ok: true, message: "Created." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not create the folder." };
  }
}

/** Rename or move `from` → `to` (both workspace-relative, both guarded). */
export async function renamePath(root: string, from: string, to: string): Promise<FsWriteResult> {
  try {
    const src = resolveInside(root, from);
    const dst = resolveInside(root, to);
    if (src === dst) return { ok: true, message: "No change." };
    // Don't overwrite an existing target.
    try {
      await fsp.access(dst);
      return { ok: false, message: "A file with that name already exists there." };
    } catch {
      // target free — proceed
    }
    await fsp.mkdir(resolve(dst, ".."), { recursive: true });
    await fsp.rename(src, dst);
    return { ok: true, message: "Moved." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not move it." };
  }
}

/** Send `rel` to the OS trash (reversible — never a hard delete). */
export async function trashPath(root: string, rel: string): Promise<FsWriteResult> {
  try {
    const abs = resolveInside(root, rel);
    const { shell } = await import("electron");
    await shell.trashItem(abs);
    return { ok: true, message: "Moved to Trash." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not delete it." };
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
