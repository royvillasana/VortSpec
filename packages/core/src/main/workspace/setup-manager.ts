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
import {
  buildFrameworkRulesDoc,
  pruneFrameworkConfigDoc,
  pruneReactArchitecture,
  scopeReactRefMandate,
  scopeReactRefExamples,
  linkFrameworkRulesInClaudeMd,
} from "@vortspec/core/framework-docs";
import {
  buildComponentTokenNamingDoc,
  linkComponentTokenNamingInEntryDoc,
  COMPONENT_TOKEN_DOC_PATH,
} from "@vortspec/core/component-tokens";
import { readProjectConfig } from "./config-manager";
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


/**
 * Scope the copied toolkit docs to THIS project's framework (change: framework-scoped rules).
 *
 * The toolkit ships one `framework-config.md` carrying all nine frameworks, and standards docs
 * that state React's architecture as if it were framework-agnostic. `CLAUDE.md` indexes those
 * standards and the doc-driven skills follow that index, so a Vue project has been reading
 * React's CVA/`forwardRef` mandates on every `/generate-artifacts`.
 *
 * Three transformations, all deterministic:
 *   1. write the active framework's rules as their own document;
 *   2. LINK it from `CLAUDE.md`, because a file nothing indexes is never read;
 *   3. remove the sections that contradict it — the other frameworks' config sections, and the
 *      React-architecture sections in the shared standards.
 *
 * Failures are NOT swallowed. A doc that the toolkit simply does not ship is expected and
 * skipped; anything else (a write failure, a permissions problem) throws, because reporting
 * setup as successful while leaving contradictory React mandates in place is the exact silent
 * wrongness this change exists to remove.
 */
/**
 * Install the component-token naming contract into a project.
 *
 * Deliberately NOT part of `scopeDocsToFramework`, for two reasons.
 *
 * It is framework-NEUTRAL. A `Components/<Component>/<Slot>` design variable maps to the same
 * code token whatever the target framework — that neutrality is the whole point, since one clean
 * design file feeds all nine. `scopeDocsToFramework` returns early when the framework is unset,
 * which would silently leave a project with no token contract at all.
 *
 * And the doc alone does not reach extraction. Measured against the pinned toolkit,
 * `extract-design-system` references no `.sdd-de/docs` path, no standards index and no entry
 * file; its first instruction is to read `.sdd-de/project.yaml`. So the rule that extraction
 * actually sees is emitted by `buildProjectYaml`, and this doc serves the skills that DO read
 * `docs/` (`sync-tokens`, `storybook`, `setup`, `commit`) plus the humans. Writing it only where
 * extraction never looks would repeat "a file nothing indexes is never read" one level up.
 */
async function installComponentTokenContract(
  projectPath: string,
  sddeDir: string,
): Promise<void> {
  await writeFile(
    join(projectPath, COMPONENT_TOKEN_DOC_PATH),
    buildComponentTokenNamingDoc(),
    "utf8",
  );
  for (const entry of ["CLAUDE.md", "AGENTS.md", "GEMINI.md", "codex.md"]) {
    await transformIfPresent(join(projectPath, entry), linkComponentTokenNamingInEntryDoc);
  }
}

async function scopeDocsToFramework(
  projectPath: string,
  sddeDir: string,
  framework?: string | null,
): Promise<void> {
  if (!framework) return;
  const rules = buildFrameworkRulesDoc(framework);
  if (!rules) return; // unknown framework — generation is STOPped anyway; invent nothing
  const docsDir = join(sddeDir, "docs");

  await writeFile(join(docsDir, "framework-rules.md"), rules, "utf8");

  // Link it from EVERY agent runtime's entry point, not just Claude's. VortSpec copies the same
  // instructions to AGENTS.md / GEMINI.md / codex.md, and authority should not depend on which
  // runtime opens the project. Idempotent, so resync cannot duplicate the line.
  for (const entry of ["CLAUDE.md", "AGENTS.md", "GEMINI.md", "codex.md"]) {
    await transformIfPresent(join(projectPath, entry), linkFrameworkRulesInClaudeMd);
  }

  // Drop the eight framework sections that do not apply.
  await transformIfPresent(join(docsDir, "framework-config.md"), (t) =>
    pruneFrameworkConfigDoc(t, framework),
  );

  // Shared standards: non-React projects lose the React architecture entirely; React/Next keep
  // it but lose the unconditional `forwardRef` mandate, which is not React 19 guidance and
  // would contradict the version-aware rule in framework-rules.md.
  for (const name of ["component-standards.md", "styling-best-practices.md"]) {
    await transformIfPresent(join(docsDir, name), (t) =>
      scopeReactRefExamples(scopeReactRefMandate(pruneReactArchitecture(t, framework), framework), framework),
    );
  }
}

/**
 * Rewrite a doc in place. A MISSING file is fine — older toolkit versions do not ship every
 * document, and that is not a failure. Any other error propagates: a half-scoped project must
 * not be reported as a successful setup.
 */
async function transformIfPresent(path: string, transform: (text: string) => string): Promise<void> {
  let original: string;
  try {
    original = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  const next = transform(original);
  if (next !== original) await writeFile(path, next, "utf8");
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

  // Scope the copied docs to this project's framework. AFTER the CLAUDE.md copy, because it
  // links the generated rules from that file's standards index.
  await scopeDocsToFramework(projectPath, sddeDir, answers.framework);
  await installComponentTokenContract(projectPath, sddeDir);

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

  // Re-scope AFTER both re-copies: the docs copy restores all nine frameworks' sections and the
  // React architecture, and the CLAUDE.md overwrite drops the rules link. Both must be redone or
  // a toolkit update silently un-scopes every project.
  const cfg = await readProjectConfig(projectPath).catch(() => null);
  await scopeDocsToFramework(projectPath, sddeDir, cfg?.framework);
  await installComponentTokenContract(projectPath, sddeDir);

  // Refresh `.claude/skills` symlinks — drop stale ones, recreate all from the new skills.
  const claudeSkills = join(projectPath, ".claude", "skills");
  await rm(claudeSkills, { recursive: true, force: true });
  await createSkillSymlinks(skillsDst, claudeSkills);

  const v = bundledToolkitVersion();
  if (v) await writeFile(join(sddeDir, TOOLKIT_VERSION_FILE), v, "utf8");

  return refreshProject(projectPath);
}
