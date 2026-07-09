import { app } from "electron";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { execFileSafe } from "../util/exec";

/**
 * The bundled SDD-DE walk-through project (change: walkthrough-project).
 *
 * Ships as a single `walkthrough.tar.gz` app resource (a complete reference
 * project without node_modules/.git). "Open the walk-through" extracts it into a
 * folder the user picked, confined to that folder, then it opens like any project.
 */

/** Resolve the bundled archive — packaged apps read it from Resources, dev from source. */
export function walkthroughArchivePath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "walkthrough.tar.gz")
    : join(__dirname, "../../resources/walkthrough.tar.gz");
}

/**
 * Extract the bundled reference project into `destPath` (must be an existing,
 * ideally empty, folder). Uses `tar` with an argument array, confined to `-C dest`.
 */
export async function extractWalkthrough(destPath: string): Promise<{ ok: boolean; message: string }> {
  const archive = walkthroughArchivePath();
  if (!existsSync(archive)) {
    return { ok: false, message: "The walk-through project isn't bundled with this build." };
  }
  if (!existsSync(destPath)) {
    return { ok: false, message: "The destination folder no longer exists." };
  }
  // Refuse to overwrite a folder that already has content.
  const entries = await readdir(destPath).catch(() => [] as string[]);
  if (entries.filter((e) => e !== ".DS_Store").length > 0) {
    return { ok: false, message: "Choose an empty folder for the walk-through project." };
  }
  const r = await execFileSafe("tar", ["-xzf", archive, "-C", destPath], { timeoutMs: 120_000 });
  if (r.spawnError) return { ok: false, message: "Couldn't extract the walk-through — `tar` is not available." };
  if (r.code !== 0) return { ok: false, message: r.stderr.trim() || "Couldn't extract the walk-through project." };
  return { ok: true, message: "Walk-through project ready." };
}
