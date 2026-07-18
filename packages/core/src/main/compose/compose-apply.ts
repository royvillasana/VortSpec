import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stripScaffold, hasScaffold, SCAFFOLD_SENTINEL } from "../../shared/compose-scaffold";
import { isCommittableSource, findFilesContaining } from "../git/git-adapter";

/**
 * Applying / sweeping a composition preview scaffold (change: canvas-compose-and-preview-bar, §6).
 *
 * Accept and the cancel/error/close cleanup both act on the source files the run
 * wrote, deterministically, by the markers `compose-scaffold` defines. Kept in the
 * main process (it writes to disk) and derived from the file contents, so it works
 * even when no canvas is mounted (a crash, a reopen).
 */

export interface ComposeApplyResult {
  ok: boolean;
  file: string;
  message?: string;
}

/**
 * Whether the run's target file is real, committable source (§6.8) — the host
 * pre-checks this the moment a run reports its `writtenFile`, so the user is never
 * offered "accept" into a generated/untracked file.
 */
export async function checkComposeTarget(projectPath: string, file: string): Promise<{ ok: boolean; reason?: string }> {
  return isCommittableSource(projectPath, file);
}

/**
 * Accept one option: keep that option's content in the file and delete every other
 * option and all scaffolding for the run. Idempotent — re-running on an
 * already-accepted (marker-free) file leaves it unchanged.
 *
 * Refuses (§6.8) to accept into a generated/untracked/ignored file — a last-line
 * guard behind the host's pre-check, so a committed accept can never land there.
 */
export async function acceptComposition(
  projectPath: string,
  file: string,
  runId: string,
  keepOption: number,
): Promise<ComposeApplyResult> {
  const committable = await isCommittableSource(projectPath, file);
  if (!committable.ok) return { ok: false, file, message: committable.reason };
  const abs = join(projectPath, file);
  const content = await readFile(abs, "utf8").catch(() => null);
  if (content === null) return { ok: false, file, message: `Could not read ${file} to accept the composition.` };
  const next = stripScaffold(content, { runId, keepOption });
  if (next !== content) await writeFile(abs, next, "utf8");
  return { ok: true, file };
}

/**
 * Sweep ALL composition scaffolding from the given files (cancel, error, or close
 * cleanup, §6.14). Marker-driven and idempotent, so a stale scaffold left by a
 * crashed run can always be cleared — the worst outcome this design can produce.
 */
export async function sweepComposition(projectPath: string, files: string[]): Promise<void> {
  for (const rel of files) {
    const abs = join(projectPath, rel);
    const content = await readFile(abs, "utf8").catch(() => null);
    if (content === null || !hasScaffold(content)) continue;
    await writeFile(abs, stripScaffold(content), "utf8");
  }
}

/**
 * Find and sweep every composition scaffold in the project (§6.14, §7.4). Run when
 * the canvas opens, so a scaffold orphaned by a crash — with no in-memory record
 * of the file it landed in — is always cleared. Idempotent; a clean project is a
 * no-op. Returns the files it swept.
 */
export async function sweepProjectScaffold(projectPath: string): Promise<{ swept: string[] }> {
  const files = await findFilesContaining(projectPath, SCAFFOLD_SENTINEL);
  await sweepComposition(projectPath, files);
  return { swept: files };
}
