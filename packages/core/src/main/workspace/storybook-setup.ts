import { spawn } from "node:child_process";
import { existsSync, type Dirent } from "node:fs";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { readProjectConfig } from "./config-manager";

/**
 * Deterministic Storybook provisioning — the cockpit's backstop so the Playground
 * ALWAYS has a real Storybook to serve once components exist, instead of silently
 * degrading to an improvised Vite gallery when the engine's `/storybook` skill
 * can't install it non-interactively.
 *
 * This provisions the *environment* only (running `storybook init`, wiring the
 * design tokens into `preview`) — exactly the kind of scaffolding the cockpit
 * already does for `.env` and `node_modules`. It never authors story CONTENT:
 * the per-component `*.stories.tsx` remain the engine's job (the SDD-DE
 * `/storybook` skill), so the methodology boundary (invariant #1) holds.
 */

export type StorybookState = "present" | "installed" | "failed";

export interface StorybookReadiness {
  /** Real Storybook is set up: a `.storybook` config AND a `storybook` script. */
  installed: boolean;
  hasConfig: boolean;
  hasScript: boolean;
  /** Number of `*.stories.*` files found under the component dir (0 = empty gallery). */
  storyCount: number;
}

const STORY_RE = /\.stories\.(tsx|ts|jsx|js|mdx|svelte|vue)$/i;
const COMPONENT_RE = /\.(tsx|jsx|vue|svelte)$/i;

/**
 * Map the project's framework to `storybook init --type`. Storybook auto-detects
 * the builder, but a correct `--type` hint avoids a misdetect on ambiguous
 * scaffolds. Returns null to let Storybook auto-detect (safer than a wrong hint).
 */
export function storybookInitType(framework: string | undefined): string | null {
  switch (framework) {
    case "react":
      return "react";
    case "next":
      return "nextjs";
    case "vue":
    case "nuxt":
      return "vue3";
    case "svelte":
      return "svelte";
    case "sveltekit":
      return "sveltekit";
    case "angular":
      return "angular";
    case "astro":
    case "vanilla":
      return "html";
    default:
      return null;
  }
}

async function readScripts(projectPath: string): Promise<Record<string, string>> {
  try {
    const pkg = JSON.parse(await readFile(join(projectPath, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

/** Recursively count files matching `re` under `dir` (bounded, skips node_modules/dotdirs). */
async function countFiles(dir: string, re: RegExp): Promise<number> {
  let count = 0;
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) count += await countFiles(full, re);
    else if (re.test(e.name)) count += 1;
  }
  return count;
}

/** Whether a project has real Storybook installed + how many stories exist. */
export async function storybookReadiness(projectPath: string): Promise<StorybookReadiness> {
  const scripts = await readScripts(projectPath);
  const hasScript = typeof scripts["storybook"] === "string";
  const hasConfig =
    existsSync(join(projectPath, ".storybook", "main.ts")) ||
    existsSync(join(projectPath, ".storybook", "main.js")) ||
    existsSync(join(projectPath, ".storybook", "main.mjs")) ||
    existsSync(join(projectPath, ".storybook"));
  const cfg = await readProjectConfig(projectPath).catch(() => null);
  const componentDir = cfg?.componentDir || "src";
  const storyCount = await countFiles(join(projectPath, componentDir), STORY_RE);
  return { installed: hasScript && hasConfig, hasConfig, hasScript, storyCount };
}

/**
 * How many built components have no story yet — the reliability signal behind
 * "a component exists ⇒ Storybook shows it". Counts source components under the
 * component dir minus story files. Never negative.
 */
export async function storyGap(projectPath: string): Promise<{ components: number; stories: number; missing: number }> {
  const cfg = await readProjectConfig(projectPath).catch(() => null);
  const componentDir = join(projectPath, cfg?.componentDir || "src");
  const stories = await countFiles(componentDir, STORY_RE);
  // Components = source files that aren't themselves stories.
  const allSource = await countFiles(componentDir, COMPONENT_RE);
  const components = Math.max(0, allSource - stories);
  return { components, stories, missing: Math.max(0, components - stories) };
}

/** Non-interactive env for `storybook init` (CI + no telemetry so it never prompts). */
function initEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CI: "1",
    STORYBOOK_DISABLE_TELEMETRY: "1",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
  };
}

/** Run `npx storybook@latest init` non-interactively, streaming an optional tail. */
function runInit(
  projectPath: string,
  type: string | null,
  onLine?: (line: string) => void,
): Promise<{ ok: boolean; tail: string }> {
  return new Promise((resolve) => {
    const args = ["--yes", "storybook@latest", "init", "--yes", "--skip-install=false"];
    if (type) args.push("--type", type);
    let tail = "";
    let child;
    try {
      child = spawn("npx", args, { cwd: projectPath, shell: false, env: initEnv() });
    } catch (err) {
      resolve({ ok: false, tail: err instanceof Error ? err.message : String(err) });
      return;
    }
    const onChunk = (buf: Buffer): void => {
      const text = buf.toString();
      tail = (tail + text).slice(-4000);
      if (onLine) for (const l of text.split("\n")) if (l.trim()) onLine(l.trim());
    };
    child.stdout?.on("data", onChunk);
    child.stderr?.on("data", onChunk);
    child.on("error", (err) => resolve({ ok: false, tail: `${tail}\n${err.message}` }));
    child.on("close", (code) => resolve({ ok: code === 0, tail }));
    // Storybook init downloads + installs a lot; give it room but stay bounded.
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      resolve({ ok: false, tail: `${tail}\nStorybook setup timed out after 6 minutes.` });
    }, 360_000);
  });
}

/** Import the project's design tokens into `.storybook/preview.*` so stories render on-token. */
async function wireTokenImport(projectPath: string, tokenFile: string | undefined): Promise<void> {
  if (!tokenFile) return;
  for (const name of ["preview.ts", "preview.tsx", "preview.js", "preview.mjs"]) {
    const p = join(projectPath, ".storybook", name);
    if (!existsSync(p)) continue;
    try {
      const src = await readFile(p, "utf8");
      const importLine = `import "../${tokenFile}";`;
      if (src.includes(importLine) || src.includes(tokenFile)) return;
      await writeFile(p, `${importLine}\n${src}`, "utf8");
    } catch {
      /* best-effort; stories still render, just without token wiring */
    }
    return;
  }
}

/**
 * Ensure a real Storybook exists for this project. Idempotent: no-op when already
 * installed. Otherwise runs `storybook init` non-interactively and wires the token
 * file. Returns the resulting readiness so callers can gate the Playground.
 */
export async function ensureStorybook(opts: {
  projectPath: string;
  framework?: string;
  tokenFile?: string;
  onLine?: (line: string) => void;
}): Promise<{ state: StorybookState; readiness: StorybookReadiness; error?: string }> {
  const before = await storybookReadiness(opts.projectPath);
  if (before.installed) return { state: "present", readiness: before };

  const cfg =
    opts.framework && opts.tokenFile
      ? null
      : await readProjectConfig(opts.projectPath).catch(() => null);
  const framework = opts.framework ?? cfg?.framework ?? undefined;
  const tokenFile = opts.tokenFile ?? cfg?.tokenFile ?? undefined;

  const r = await runInit(opts.projectPath, storybookInitType(framework), opts.onLine);
  if (!r.ok) {
    return {
      state: "failed",
      readiness: await storybookReadiness(opts.projectPath),
      error:
        "Couldn't set up Storybook automatically. " +
        "Open a terminal in the project and run `npx storybook@latest init`.\n" +
        r.tail.split("\n").slice(-6).join("\n"),
    };
  }
  await wireTokenImport(opts.projectPath, tokenFile);
  const after = await storybookReadiness(opts.projectPath);
  return after.installed
    ? { state: "installed", readiness: after }
    : {
        state: "failed",
        readiness: after,
        error: "Storybook init finished but no `.storybook` config or `storybook` script was created.",
      };
}
