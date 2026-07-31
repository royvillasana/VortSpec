/**
 * Main-process persistence for the Draw feature. Everything lives under a project's
 * `.vortspec/canvas/` directory:
 *
 *   graph.json          — the DrawGraph (see ../../shared/draw-graph.ts), the durable substrate
 *   canvas.excalidraw   — the Excalidraw scene, an OPAQUE string (never parsed here)
 *   exports/<id>.png    — sketch PNGs exported from a frame
 *   exports/<id>.html   — generated version outputs (referenced by Version.outputRef)
 *
 * This module owns disk I/O (async, node:fs/promises); the graph model, builders, and queries stay
 * pure in the shared module. EVERY write is path-guarded so the resolved target can never escape
 * `<projectPath>/.vortspec/canvas` — traversal and absolute-escape attempts are sanitized away and,
 * as a defense in depth, rejected outright (mirrors the containment style in ../lite/light-serve.ts).
 * The Excalidraw scene is treated as an opaque string — we neither import nor depend on Excalidraw.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { emptyGraph, parseGraph, serializeGraph, type DrawGraph } from "../../shared/draw-graph";

/** Project-relative root for all Draw persistence. */
export const CANVAS_DIR = ".vortspec/canvas";

const GRAPH_FILE = "graph.json";
const SCENE_FILE = "canvas.excalidraw";
const EXPORTS_SUBDIR = "exports";

/** The absolute `.vortspec/canvas` directory for a project. */
function canvasDir(projectPath: string): string {
  return resolve(projectPath, CANVAS_DIR);
}

/** The absolute `.vortspec/canvas/exports` directory for a project. */
function exportsDir(projectPath: string): string {
  return join(canvasDir(projectPath), EXPORTS_SUBDIR);
}

/**
 * Reduce an arbitrary id (frameId / versionId) to a single safe filename segment: no path
 * separators, no `..`, no leading/trailing dots or dashes. This alone prevents traversal; the
 * caller still path-guards the resolved path as a second layer.
 */
function sanitizeSegment(raw: string): string {
  const cleaned = String(raw)
    .replace(/[^A-Za-z0-9._-]+/g, "-") // drop separators & anything exotic
    .replace(/\.{2,}/g, "-") // collapse `..` so no dotdot survives
    .replace(/^[-.]+/, "") // no leading dot/dash
    .replace(/[-.]+$/, ""); // no trailing dot/dash
  return cleaned || "unnamed";
}

/**
 * Resolve a file inside `exports/` from an untrusted id, guaranteeing containment. Returns the
 * absolute path; throws if the (already-sanitized) path would somehow escape the canvas dir.
 */
function safeExportPath(projectPath: string, id: string, ext: string): string {
  const dir = exportsDir(projectPath);
  const file = `${sanitizeSegment(id)}${ext}`;
  const abs = resolve(dir, file);
  // Containment guard: the resolved file must live directly under exports/ (no `..`, no absolute escape).
  if (abs !== join(dir, file) || !abs.startsWith(dir + sep)) {
    throw new Error(`canvas-store: refusing to write outside the canvas dir (id: ${id})`);
  }
  return abs;
}

// ── graph ──────────────────────────────────────────────────────────────────────

/** Load and parse `graph.json`, or return an empty graph if it is absent/unreadable/malformed. */
export async function loadGraph(projectPath: string): Promise<DrawGraph> {
  try {
    const text = await readFile(join(canvasDir(projectPath), GRAPH_FILE), "utf8");
    return parseGraph(text);
  } catch {
    return emptyGraph();
  }
}

/** Serialize and write the graph to `graph.json`, creating the canvas dir if needed. */
export async function saveGraph(projectPath: string, graph: DrawGraph): Promise<void> {
  const dir = canvasDir(projectPath);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, GRAPH_FILE), serializeGraph(graph), "utf8");
}

// ── scene (opaque Excalidraw string) ─────────────────────────────────────────────

/** Read the raw `canvas.excalidraw` scene string, or null if it is absent/unreadable. */
export async function loadScene(projectPath: string): Promise<string | null> {
  try {
    return await readFile(join(canvasDir(projectPath), SCENE_FILE), "utf8");
  } catch {
    return null;
  }
}

/** Write the raw Excalidraw scene string to `canvas.excalidraw` (opaque — not parsed). */
export async function saveScene(projectPath: string, sceneJson: string): Promise<void> {
  const dir = canvasDir(projectPath);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, SCENE_FILE), sceneJson, "utf8");
}

// ── exports (sketch PNGs + version outputs) ──────────────────────────────────────

/**
 * Decode a `data:image/png;base64,…` data URL and write it to `exports/<sanitized frameId>.png`.
 * Returns the absolute path written. Throws if the data URL is not a base64 PNG.
 */
export async function writeSketchPng(projectPath: string, frameId: string, dataUrl: string): Promise<string> {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!m) {
    throw new Error("canvas-store: writeSketchPng expects a data:image/png;base64,… URL");
  }
  const bytes = Buffer.from(m[1], "base64");
  const abs = safeExportPath(projectPath, frameId, ".png");
  await mkdir(exportsDir(projectPath), { recursive: true });
  await writeFile(abs, bytes);
  return abs;
}

/**
 * Write a generated version's HTML output to `exports/<sanitized versionId>.html`. Returns the
 * absolute path — used as the `outputRef` on the graph's Version node.
 */
export async function writeVersionOutput(projectPath: string, versionId: string, html: string): Promise<string> {
  const abs = safeExportPath(projectPath, versionId, ".html");
  await mkdir(exportsDir(projectPath), { recursive: true });
  await writeFile(abs, html, "utf8");
  return abs;
}
