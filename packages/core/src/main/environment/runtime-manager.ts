import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";

/**
 * The VortSpec-managed tool prefix (change: automate-base-tool-install).
 *
 * Node ships bundled with the app and the Claude CLI installs here — so the base
 * tools need no Homebrew, no system Node, and no sudo. `~/.vortspec/bin` is prepended
 * to PATH for every child process VortSpec spawns and for the embedded terminal, so
 * `node`/`npm`/`claude` resolve the managed copies regardless of the user's shell.
 */
export const MANAGED_DIR = join(homedir(), ".vortspec");
export const MANAGED_BIN = join(MANAGED_DIR, "bin");

/**
 * Locate the Node runtime bundled with the packaged app (per-arch), or `null` when
 * running unpacked in dev (where the system Node on PATH is used instead). The app
 * build ships it under `resources/node/bin` (see the electron-builder config).
 */
export function bundledNodeBin(): string | null {
  const res = process.resourcesPath; // undefined outside a packaged Electron app
  if (!res) return null;
  const bin = join(res, "node", "bin");
  return existsSync(join(bin, "node")) ? bin : null;
}

/** Prepend the managed bin dir to `process.env.PATH` (idempotent). */
export function prependManagedBin(env: NodeJS.ProcessEnv = process.env): void {
  const path = env.PATH ?? "";
  if (!path.split(":").includes(MANAGED_BIN)) env.PATH = path ? `${MANAGED_BIN}:${path}` : MANAGED_BIN;
}

/**
 * Ensure the managed runtime is ready and on PATH: create `~/.vortspec/bin`, link the
 * bundled `node`/`npm`/`npx` into it (when a bundled runtime exists), and prepend the
 * bin dir to PATH so every spawn resolves the managed tools first. Idempotent; never
 * throws (best-effort — in dev with no bundle it just makes the dir + PATH entry the
 * Claude-CLI install will populate). Call once at boot, after `fixGuiPath`.
 */
export async function ensureManagedRuntime(): Promise<void> {
  try {
    await mkdir(MANAGED_BIN, { recursive: true });
    const nodeBin = bundledNodeBin();
    if (nodeBin) {
      for (const tool of ["node", "npm", "npx"]) {
        const link = join(MANAGED_BIN, tool);
        const target = join(nodeBin, tool);
        if (!existsSync(link) && existsSync(target)) {
          try {
            await symlink(target, link);
          } catch {
            /* already linked, or symlinks unsupported — PATH entry still helps */
          }
        }
      }
    }
  } catch {
    /* best-effort: a missing managed dir just means installs fall back to system tools */
  }
  prependManagedBin();
}
