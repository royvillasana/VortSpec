import { join } from "node:path";
import { access } from "node:fs/promises";
import { execFileSafe } from "../util/exec";
import type { ToolkitStatus } from "@vortspec/core/ipc";

/**
 * Detects and installs the SDD-DE toolkit (`@royvillasana/sdd-de`) in a project.
 *
 * The CLI installs to `.sdd-de/` (skills under `.sdd-de/ai-specs/skills/`,
 * config in `.sdd-de/project.yaml`) and symlinks the skills into `.claude/skills/`
 * so Claude Code can invoke `/enrich-brief`, `/generate-artifacts`, etc.
 * Detection is fully implemented and read-only.
 *
 * INSTALL: `npx @royvillasana/sdd-de` is **interactive** (framework, language,
 * design-source prompts via @clack). It therefore needs a real terminal (PTY),
 * which lands in D5. Until then `installToolkit` runs a non-interactive override
 * from `VORTSPEC_TOOLKIT_INSTALL_CMD` if set, otherwise it returns an actionable
 * message telling the user to run the command in a terminal.
 */

export const SDD_DE_INSTALL_CMD = "npx @royvillasana/sdd-de";
export const SDD_DE_UPDATE_CMD = "npx @royvillasana/sdd-de update";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function getToolkitStatus(projectPath: string): Promise<ToolkitStatus> {
  const sdde = join(projectPath, ".sdd-de");
  // `configured` is the real "this is a set-up project" signal — the setup wizard
  // (and the CLI) write project.yaml only after intake. `present` is the looser
  // "toolkit skills are scaffolded" signal used for the installed badge. An empty
  // folder has neither, so it routes to intake instead of the extraction flow.
  const configured = await exists(join(sdde, "project.yaml"));
  const present = configured || (await exists(join(sdde, "ai-specs", "skills")));
  // The CLI does not write an installed-version marker, so version is unknown
  // when present; the dashboard shows "installed". Update detection is deferred.
  return { present, configured, version: null, updateAvailable: false };
}

export async function installToolkit(projectPath: string): Promise<ToolkitStatus> {
  const override = process.env.VORTSPEC_TOOLKIT_INSTALL_CMD?.trim();
  if (!override) {
    throw new Error(
      `SDD-DE setup is interactive. Run \`${SDD_DE_INSTALL_CMD}\` in a terminal in this ` +
        `project and answer the prompts, then re-check. (In-app terminal install arrives in D5.)`,
    );
  }
  const [cmd, ...args] = override.split(/\s+/);
  const r = await execFileSafe(cmd, args, { cwd: projectPath, timeoutMs: 180000 });
  if (r.spawnError || r.code !== 0) {
    throw new Error(
      `Toolkit install failed: ${r.spawnError ?? r.stderr.trim() ?? `exit ${r.code}`}`,
    );
  }
  return getToolkitStatus(projectPath);
}
