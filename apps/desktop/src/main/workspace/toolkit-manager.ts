import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { execFileSafe } from "../util/exec";
import type { ToolkitStatus } from "../../shared/ipc";

/**
 * Detects and installs the SDD-DE toolkit inside a project.
 *
 * The toolkit is marked by `.sdd-de/manifest.json` (`{ "version": "x.y.z" }`)
 * in the project root. Detection is fully implemented and read-only.
 *
 * NOTE (design open question): the *exact* install/update command that mirrors
 * the SDD-DE CLI's `init` is not yet confirmed against the toolkit source. It is
 * isolated here behind one seam: `installToolkit` runs the command from
 * `VORTSPEC_TOOLKIT_INSTALL_CMD` (space-separated argv) when set, else reports
 * that the mechanism is not yet configured. Wire the real command here once
 * verified — no other module needs to change.
 */

const MANIFEST_REL = join(".sdd-de", "manifest.json");

async function readInstalledVersion(projectPath: string): Promise<string | null> {
  try {
    const raw = await readFile(join(projectPath, MANIFEST_REL), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    return null;
  }
}

export async function getToolkitStatus(projectPath: string): Promise<ToolkitStatus> {
  const version = await readInstalledVersion(projectPath);
  return {
    present: version !== null,
    version,
    // Update detection compares against a known-latest source once the real
    // toolkit is wired; until then we never claim an update is available.
    updateAvailable: false,
  };
}

export async function installToolkit(projectPath: string): Promise<ToolkitStatus> {
  const configured = process.env.VORTSPEC_TOOLKIT_INSTALL_CMD?.trim();
  if (!configured) {
    throw new Error(
      "SDD-DE toolkit install command is not configured yet. Set VORTSPEC_TOOLKIT_INSTALL_CMD " +
        "to the verified init command, or install the toolkit manually. (design open question — task 2.6)",
    );
  }
  const [cmd, ...args] = configured.split(/\s+/);
  const r = await execFileSafe(cmd, args, { cwd: projectPath, timeoutMs: 120000 });
  if (r.spawnError || r.code !== 0) {
    throw new Error(
      `Toolkit install failed: ${r.spawnError ?? r.stderr.trim() ?? `exit ${r.code}`}`,
    );
  }
  return getToolkitStatus(projectPath);
}
