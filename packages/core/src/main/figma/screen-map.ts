import { join, dirname } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { screenMapSchema, type ScreenMap, type ScreenEntry } from "@vortspec/core/inspector";

/**
 * The durable screen ↔ Figma join table (change: add-screen-to-figma). Persists the
 * per-project Figma `figmaFileKey` + per-screen `{ file, figmaNodeId }` at
 * `.vortspec/maps/screens.json`, so a re-send updates the existing frame and a pull-back
 * targets the right node. Mirrors `design-map.ts` (tokens/components). VortSpec is the
 * store; the send/pull runs do the Figma work and report back the ids we persist here.
 */

const SCREENS_MAP_PATH = ".vortspec/maps/screens.json";

/** Read the durable screen map. Missing/malformed → an empty map. */
export async function readScreenMap(projectPath: string): Promise<ScreenMap> {
  try {
    const raw = await readFile(join(projectPath, SCREENS_MAP_PATH), "utf8");
    const parsed = screenMapSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    /* no map yet */
  }
  return { screens: {} };
}

/** Write the durable screen map (best-effort; creates `.vortspec/maps/`). */
export async function writeScreenMap(projectPath: string, map: ScreenMap): Promise<void> {
  const path = join(projectPath, SCREENS_MAP_PATH);
  await mkdir(dirname(path), { recursive: true }).catch(() => undefined);
  await writeFile(path, `${JSON.stringify(map, null, 2)}\n`, "utf8").catch(() => undefined);
}

/** Pull a Figma file key out of a figma.com URL (`/design/<key>/…` or `/file/<key>/…`). */
function fileKeyFromUrl(url: string): string | null {
  const m = url.match(/figma\.com\/(?:design|file)\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

/**
 * The project's design-system Figma file key — where the local components live. This is
 * the default send target (Decision 4): local components are file-scoped, so a screen must
 * be built in the same file to instance them. Reads `.sdd-de/components.json` (`fileKey`),
 * falling back to `.sdd-de/project.yaml` (`figma_file_url`). Null when neither is present.
 */
export async function designSystemFileKey(projectPath: string): Promise<string | null> {
  try {
    const raw = await readFile(join(projectPath, ".sdd-de/components.json"), "utf8");
    const j = JSON.parse(raw) as { fileKey?: unknown };
    if (typeof j.fileKey === "string" && j.fileKey) return j.fileKey;
  } catch {
    /* no components.json */
  }
  try {
    const raw = await readFile(join(projectPath, ".sdd-de/project.yaml"), "utf8");
    const line = raw.match(/^\s*figma_file_url:\s*["']?([^"'\s]+)["']?/m);
    if (line) return fileKeyFromUrl(line[1]);
  } catch {
    /* no project.yaml */
  }
  return null;
}

/**
 * The effective target file for a send: the key already recorded in the screen map (a
 * previously-used file), else the project's design-system file. Null when neither exists —
 * the send then provisions a fallback `VortSpec — <project> Screens` file and records it.
 */
export async function resolveTargetFileKey(projectPath: string): Promise<string | null> {
  const map = await readScreenMap(projectPath);
  if (map.figmaFileKey) return map.figmaFileKey;
  return designSystemFileKey(projectPath);
}

/** Record one screen ↔ Figma node join (and the target file key, once known). */
export async function upsertScreen(
  projectPath: string,
  screenKey: string,
  entry: ScreenEntry,
  fileKey?: string,
): Promise<ScreenMap> {
  const map = await readScreenMap(projectPath);
  map.screens[screenKey] = entry;
  if (fileKey) map.figmaFileKey = fileKey;
  await writeScreenMap(projectPath, map);
  return map;
}
