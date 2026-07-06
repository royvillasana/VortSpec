import { app, dialog, shell } from "electron";
import { join, basename, resolve, sep } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { Project } from "../../shared/ipc";
import { projectListSchema } from "../../shared/ipc";
import { getToolkitStatus } from "./toolkit-manager";

/**
 * Manages the set of known projects and folder selection. The registry is
 * persisted as plain JSON in the app's userData dir. Project state that can be
 * derived from disk (name, toolkit version) is always recomputed on read, so
 * the registry only stores identity + provenance.
 */

interface StoredProject {
  id: string;
  path: string;
  addedAt: string;
}

function registryPath(): string {
  return join(app.getPath("userData"), "projects.json");
}

function projectId(path: string): string {
  return createHash("sha1").update(path).digest("hex").slice(0, 12);
}

async function readRegistry(): Promise<StoredProject[]> {
  try {
    const raw = await readFile(registryPath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is StoredProject =>
        typeof p === "object" &&
        p !== null &&
        typeof (p as StoredProject).path === "string",
    );
  } catch {
    return [];
  }
}

async function writeRegistry(entries: StoredProject[]): Promise<void> {
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(registryPath(), JSON.stringify(entries, null, 2), "utf8");
}

/** Hydrate a stored entry into a full Project by reading disk-derived state. */
async function hydrate(entry: StoredProject): Promise<Project> {
  const toolkit = await getToolkitStatus(entry.path);
  return {
    id: entry.id,
    name: basename(entry.path),
    path: entry.path,
    toolkit,
    lastRunStatus: "none",
    addedAt: entry.addedAt,
  };
}

export async function listProjects(): Promise<Project[]> {
  const entries = await readRegistry();
  const projects = await Promise.all(entries.map(hydrate));
  return projectListSchema.parse(projects);
}

export async function pickFolder(
  opts: { create: boolean } = { create: false },
): Promise<Project | null> {
  const result = await dialog.showOpenDialog({
    title: opts.create ? "Create or choose a project folder" : "Choose a project folder",
    properties: opts.create
      ? ["openDirectory", "createDirectory"]
      : ["openDirectory"],
    buttonLabel: "Use this folder",
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return registerPath(result.filePaths[0]!);
}

/** Create a brand-new folder (name + location) and register it as a project. */
export async function createFolder(): Promise<Project | null> {
  const result = await dialog.showSaveDialog({
    title: "Create a new project folder",
    buttonLabel: "Create folder",
    nameFieldLabel: "Folder name:",
    message: "Choose where to create your new project folder",
  });
  if (result.canceled || !result.filePath) return null;
  await mkdir(result.filePath, { recursive: true });
  return registerPath(result.filePath);
}

/** Add a path to the registry (deduped) and return the hydrated project. */
async function registerPath(path: string): Promise<Project> {
  const entries = await readRegistry();
  const existing = entries.find((e) => e.path === path);
  const entry: StoredProject =
    existing ?? { id: projectId(path), path, addedAt: new Date().toISOString() };
  if (!existing) {
    entries.push(entry);
    await writeRegistry(entries);
  }
  return hydrate(entry);
}

export async function refreshProject(path: string): Promise<Project> {
  const entries = await readRegistry();
  const entry =
    entries.find((e) => e.path === path) ??
    ({ id: projectId(path), path, addedAt: new Date().toISOString() } as StoredProject);
  return hydrate(entry);
}

export async function openFolder(path: string): Promise<void> {
  await shell.openPath(path);
}

/**
 * Reveal a project file in the OS file manager (Finder). `relPath` is resolved
 * against the project root and confined to it — a path that escapes the project
 * is refused, so the renderer can never point this at an arbitrary location.
 */
export function revealPath(projectPath: string, relPath: string): void {
  const target = resolve(projectPath, relPath);
  const root = resolve(projectPath);
  if (target !== root && !target.startsWith(root + sep)) return;
  shell.showItemInFolder(target);
}
