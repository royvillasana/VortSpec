import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

/**
 * Component thumbnail cache (change: canvas-compose-and-preview-bar).
 *
 * The component picker's hover preview shows a rendered image per component. Images
 * are rendered on demand and cached under `.vortspec/thumbs/<name>.png`, so the
 * picker reads a cached PNG here. (The render+capture that WRITES the cache runs off
 * the live canvas — see `writeComponentThumbnail` for the store side.)
 */

/** A filesystem-safe stem for a component name. */
function thumbStem(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, "_");
}

function thumbPath(projectPath: string, name: string): string {
  return join(projectPath, ".vortspec", "thumbs", `${thumbStem(name)}.png`);
}

/** Read a cached thumbnail as a data URL, or null when none is cached yet. */
export async function readComponentThumbnail(projectPath: string, name: string): Promise<string | null> {
  const buf = await readFile(thumbPath(projectPath, name)).catch(() => null);
  return buf ? `data:image/png;base64,${buf.toString("base64")}` : null;
}

/** Store a rendered thumbnail (PNG bytes, base64) for a component. */
export async function writeComponentThumbnail(projectPath: string, name: string, pngBase64: string): Promise<void> {
  const abs = thumbPath(projectPath, name);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, Buffer.from(pngBase64, "base64"));
}
