import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import {
  cp,
  mkdir,
  rm,
  writeFile,
  copyFile,
  readdir,
  symlink,
  readFile,
  appendFile,
  access,
} from "node:fs/promises";
import { buildProjectYaml, type SetupAnswers } from "@vortspec/core/setup";
import { refreshProject } from "./workspace-manager";
import type { Project } from "@vortspec/core/ipc";

/**
 * Performs the SDD-DE init non-interactively from the GUI wizard answers — the
 * same file operations as `npx @royvillasana/sdd-de`, sourced from the bundled
 * `@royvillasana/sdd-de` package (no interactive prompts, no network):
 *   - copy skills → `.sdd-de/ai-specs/skills/`, docs → `.sdd-de/docs/`
 *   - write `.sdd-de/project.yaml` from the answers
 *   - copy CLAUDE.md / AGENTS.md / GEMINI.md / codex.md (if absent)
 *   - symlink each skill into `.claude/skills/` so Claude Code can invoke it
 *   - add `.sdd-de/` to `.gitignore`
 */

const require = createRequire(import.meta.url);

/**
 * In the packaged app the bundled toolkit lives inside `app.asar`, but Electron's
 * asar layer does NOT patch `fs.cp`/`fs.opendir`, so copying from an `app.asar`
 * path throws `ENOTDIR`. electron-builder is configured to unpack the toolkit
 * (`asarUnpack`), so the real files sit under `app.asar.unpacked`. Map the
 * resolved module path to that unpacked twin. No-op in dev (no asar in the path).
 */
export function toUnpacked(p: string): string {
  if (p.includes(`app.asar.unpacked${sep}`)) return p;
  return p.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`);
}

function packageDir(): string {
  return toUnpacked(dirname(require.resolve("@royvillasana/sdd-de/package.json")));
}

/** Marker file written into `.sdd-de/` recording the toolkit version last copied in, so
 *  the app can tell a project's version (the CLI writes none) and offer an update. */
export const TOOLKIT_VERSION_FILE = ".toolkit-version";

/** The version of the `@royvillasana/sdd-de` bundled with this build, or null. */
export function bundledToolkitVersion(): string | null {
  try {
    return (require("@royvillasana/sdd-de/package.json") as { version?: string }).version ?? null;
  } catch {
    return null;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function createSkillSymlinks(sourceDir: string, targetDir: string): Promise<void> {
  if (!(await exists(sourceDir))) return;
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const linkPath = join(targetDir, entry.name);
    const linkTarget = `../../.sdd-de/ai-specs/skills/${entry.name}`;
    if (!(await exists(linkPath))) {
      try {
        await symlink(linkTarget, linkPath);
      } catch {
        /* symlink may be unsupported; skills still readable via .sdd-de/ */
      }
    }
  }
}

export async function createProject(
  projectPath: string,
  answers: SetupAnswers,
): Promise<Project> {
  const pkgDir = packageDir();
  const sddeDir = join(projectPath, ".sdd-de");

  // Skills + docs
  await mkdir(sddeDir, { recursive: true });
  await cp(join(pkgDir, "ai-specs", "skills"), join(sddeDir, "ai-specs", "skills"), {
    recursive: true,
  });
  await cp(join(pkgDir, "docs"), join(sddeDir, "docs"), { recursive: true });

  // project.yaml
  await writeFile(join(sddeDir, "project.yaml"), buildProjectYaml(answers), "utf8");

  // CLAUDE.md + multi-agent companions (only if absent)
  const claudeSrc = join(pkgDir, "CLAUDE.md");
  for (const name of ["CLAUDE.md", "AGENTS.md", "GEMINI.md", "codex.md"]) {
    const dst = join(projectPath, name);
    if (!(await exists(dst))) {
      try {
        await copyFile(claudeSrc, dst);
      } catch {
        /* CLAUDE.md may not ship in older toolkit versions */
      }
    }
  }

  // .claude/skills symlinks
  await createSkillSymlinks(
    join(sddeDir, "ai-specs", "skills"),
    join(projectPath, ".claude", "skills"),
  );

  // .gitignore — the SDD-DE toolkit and the VortSpec derived scan cache (`.vortspec/index/`
  // is a pure, self-healing cache; the durable maps in `.vortspec/maps/` are intentionally
  // left tracked, as shared design-system knowledge).
  const gitignorePath = join(projectPath, ".gitignore");
  if (await exists(gitignorePath)) {
    const content = await readFile(gitignorePath, "utf8");
    let add = "";
    if (!content.includes(".sdd-de")) add += "\n# SDD-DE toolkit\n.sdd-de/\n";
    if (!content.includes(".vortspec/index")) add += "\n# VortSpec scan cache (derived)\n.vortspec/index/\n";
    if (add) await appendFile(gitignorePath, add);
  }

  // Record the toolkit version copied in, so the app can later detect an update.
  const v = bundledToolkitVersion();
  if (v) await writeFile(join(sddeDir, TOOLKIT_VERSION_FILE), v, "utf8");

  return refreshProject(projectPath);
}

/**
 * Re-sync an existing project's SDD-DE toolkit to the version bundled with this build —
 * the in-app equivalent of `npx @royvillasana/sdd-de update`, but non-interactive (no CLI,
 * no TTY). Overwrites skills + docs (clean, so a renamed/removed skill doesn't linger),
 * always overwrites the CLAUDE.md companions, refreshes the `.claude/skills` symlinks, and
 * stamps the version marker. `project.yaml` is PRESERVED — the user's config is untouched.
 */
export async function resyncToolkit(projectPath: string): Promise<Project> {
  const pkgDir = packageDir();
  const sddeDir = join(projectPath, ".sdd-de");
  if (!(await exists(sddeDir))) {
    throw new Error("This project has no SDD-DE toolkit yet — run setup first, then update.");
  }
  // Skills + docs — clean overwrite (remove first so files dropped in the new version go).
  const skillsDst = join(sddeDir, "ai-specs", "skills");
  await rm(skillsDst, { recursive: true, force: true });
  await mkdir(join(sddeDir, "ai-specs"), { recursive: true });
  await cp(join(pkgDir, "ai-specs", "skills"), skillsDst, { recursive: true });
  const docsDst = join(sddeDir, "docs");
  await rm(docsDst, { recursive: true, force: true });
  await cp(join(pkgDir, "docs"), docsDst, { recursive: true });

  // CLAUDE.md + companions — always overwrite on update (unlike setup, which skips if present).
  const claudeSrc = join(pkgDir, "CLAUDE.md");
  for (const name of ["CLAUDE.md", "AGENTS.md", "GEMINI.md", "codex.md"]) {
    try {
      await copyFile(claudeSrc, join(projectPath, name));
    } catch {
      /* CLAUDE.md may not ship in older toolkit versions */
    }
  }

  // Refresh `.claude/skills` symlinks — drop stale ones, recreate all from the new skills.
  const claudeSkills = join(projectPath, ".claude", "skills");
  await rm(claudeSkills, { recursive: true, force: true });
  await createSkillSymlinks(skillsDst, claudeSkills);

  const v = bundledToolkitVersion();
  if (v) await writeFile(join(sddeDir, TOOLKIT_VERSION_FILE), v, "utf8");

  return refreshProject(projectPath);
}
