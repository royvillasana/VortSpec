import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname, relative, posix } from "node:path";
import { readProjectConfig } from "./config-manager";
import { renderTailwindConfigCjs } from "./token-theme-bridge";

/**
 * Deterministic styling-pipeline provisioning (change: styling-foundation-gate).
 *
 * The cockpit's backstop so a `styling: tailwind` project ALWAYS has a working
 * Tailwind pipeline before the first component build and before Storybook — instead
 * of silently rendering the token-driven components as unstyled skeletons because no
 * `tailwind.config`/`postcss.config`/`@tailwind` entry was ever generated.
 *
 * This provisions the *environment* only (config, postcss, an @tailwind entry CSS, the
 * Storybook preview import, and the postcss/autoprefixer deps) plus the token→theme
 * bridge derived from the project's tokens. It never authors component CODE, so the
 * methodology boundary (invariant #1) holds. Idempotent and non-destructive: an
 * existing config is left untouched; only missing pieces are created.
 */

const TAILWIND_CONFIG_NAMES = [
  "tailwind.config.js",
  "tailwind.config.cjs",
  "tailwind.config.mjs",
  "tailwind.config.ts",
];
const POSTCSS_CONFIG_NAMES = ["postcss.config.js", "postcss.config.cjs", "postcss.config.mjs"];
const PREVIEW_NAMES = [".storybook/preview.ts", ".storybook/preview.tsx", ".storybook/preview.js"];

export interface StylingPipelineResult {
  /** False when the project's styling isn't one this step provisions (only tailwind today). */
  applicable: boolean;
  created: string[];
  preExisting: string[];
  /** Set when postcss/autoprefixer had to be (or should be) installed. */
  depsInstalled: boolean;
  /** Present when deps could not be installed — the exact command the user should run. */
  depsFixIt?: string;
}

const first = (projectPath: string, names: string[]): string | null =>
  names.find((n) => existsSync(join(projectPath, n))) ?? null;

/** Detect the project's package manager from its lockfile. */
export function detectPackageManager(projectPath: string): "pnpm" | "yarn" | "npm" | null {
  if (existsSync(join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(projectPath, "yarn.lock"))) return "yarn";
  if (existsSync(join(projectPath, "package-lock.json"))) return "npm";
  return null;
}

function addArgs(pm: "pnpm" | "yarn" | "npm", pkgs: string[]): string[] {
  if (pm === "yarn") return ["add", "-D", ...pkgs];
  if (pm === "pnpm") return ["add", "-D", ...pkgs];
  return ["install", "-D", ...pkgs];
}

async function hasDeps(projectPath: string, pkgs: string[]): Promise<boolean> {
  try {
    const pkg = JSON.parse(await readFile(join(projectPath, "package.json"), "utf8"));
    const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    return pkgs.every((p) => p in all || existsSync(join(projectPath, "node_modules", p)));
  } catch {
    return false;
  }
}

function runInstall(projectPath: string, pm: "pnpm" | "yarn" | "npm", pkgs: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    let child;
    try {
      // Inherit the parent env so the package-manager binary resolves on PATH (the
      // GUI process's PATH), matching how the Storybook installer spawns.
      child = spawn(pm, addArgs(pm, pkgs), {
        cwd: projectPath,
        shell: false,
        env: { ...process.env, CI: "1", NO_COLOR: "1" },
      });
    } catch {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      resolve(false);
    }, 300_000);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

export interface StylingPipelineOptions {
  /** Override the dependency installer (tests inject a stub to avoid a real install). */
  install?: (pm: "pnpm" | "yarn" | "npm", pkgs: string[]) => Promise<boolean>;
}

/**
 * Ensure the styling pipeline exists for a `styling: tailwind` project. Best-effort;
 * never throws. Returns what it created, what already existed, and whether the required
 * build deps are in place (with a fix-it command when they could not be installed).
 */
export async function ensureStylingPipeline(
  projectPath: string,
  opts: StylingPipelineOptions = {},
): Promise<StylingPipelineResult> {
  const created: string[] = [];
  const preExisting: string[] = [];

  // Mirror tsconfig path aliases into Storybook's Vite config — needed for ANY project
  // whose components import via `@/…`, regardless of styling. Vite does not read tsconfig
  // paths, so without this `@/lib/utils` fails to resolve in the Storybook build even though
  // tsc passes. Runs before the tailwind check so non-tailwind projects are covered too.
  const alias = await ensureStorybookAliases(projectPath);
  created.push(...alias.created);
  preExisting.push(...alias.preExisting);

  const config = await readProjectConfig(projectPath);
  if (!config || config.styling !== "tailwind") {
    return { applicable: false, created, preExisting, depsInstalled: false };
  }

  const tokenFileRel = config.tokenFile || "src/styles/tokens.css";
  const stylesDir = dirname(tokenFileRel) || "src/styles";

  // 1. tailwind.config — create only when none exists (never overwrite a hand-authored one).
  const existingTw = first(projectPath, TAILWIND_CONFIG_NAMES);
  if (existingTw) preExisting.push(existingTw);
  else {
    await writeFile(
      join(projectPath, "tailwind.config.cjs"),
      renderTailwindConfigCjs(posix.normalize(tokenFileRel)),
      "utf8",
    ).catch(() => undefined);
    created.push("tailwind.config.cjs");
  }

  // 2. postcss.config — required for Vite/Storybook to run Tailwind over the CSS.
  const existingPc = first(projectPath, POSTCSS_CONFIG_NAMES);
  if (existingPc) preExisting.push(existingPc);
  else {
    await writeFile(
      join(projectPath, "postcss.config.cjs"),
      "/** Runs Tailwind (and autoprefixer) over the CSS so the @tailwind layers compile. */\n" +
        "module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };\n",
      "utf8",
    ).catch(() => undefined);
    created.push("postcss.config.cjs");
  }

  // 3. @tailwind entry stylesheet next to the tokens file.
  const entryRel = join(stylesDir, "tailwind.css");
  if (existsSync(join(projectPath, entryRel))) preExisting.push(entryRel);
  else {
    await writeFile(
      join(projectPath, entryRel),
      "/* Tailwind base/components/utilities. Without this (and the tailwind/postcss configs)\n" +
        " * the token utility classes compile to nothing and components render unstyled.\n" +
        " * Design-token variables live in tokens.css. */\n" +
        "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
      "utf8",
    ).catch(() => undefined);
    created.push(entryRel);
  }

  // 4. Storybook preview imports the entry (before tokens.css) — append only if absent.
  const preview = first(projectPath, PREVIEW_NAMES);
  if (preview) {
    await ensurePreviewImport(projectPath, preview, entryRel, tokenFileRel).then(
      (added) => (added ? created : preExisting).push(`${preview} (tailwind import)`),
    );
  }

  // 5. tailwindcss/postcss/autoprefixer deps. Attempt the install automatically — a
  // fresh project has no lockfile yet, so default to npm rather than skipping (the bug
  // that surfaced the fix-it even though Tailwind was selected). Only fall back to a
  // fix-it card when the install actually fails.
  const deps = ["tailwindcss", "postcss", "autoprefixer"];
  let depsInstalled = await hasDeps(projectPath, deps);
  let depsFixIt: string | undefined;
  if (!depsInstalled) {
    const pm = detectPackageManager(projectPath) ?? "npm";
    const install = opts.install ?? ((p, pkgs) => runInstall(projectPath, p, pkgs));
    depsInstalled = await install(pm, deps);
    if (!depsInstalled) depsFixIt = `${pm} ${addArgs(pm, deps).join(" ")}`;
  }

  return { applicable: true, created, preExisting, depsInstalled, depsFixIt };
}

/**
 * Add `import "<entry>";` to the Storybook preview, before the tokens import if present
 * (so utilities are declared before the variables they reference). Returns whether it
 * changed the file. Exported for testing.
 */
export async function ensurePreviewImport(
  projectPath: string,
  previewRel: string,
  entryRel: string,
  tokenFileRel: string,
): Promise<boolean> {
  const previewPath = join(projectPath, previewRel);
  let src: string;
  try {
    src = await readFile(previewPath, "utf8");
  } catch {
    return false;
  }
  const importSpec = toImportSpec(dirname(previewRel), entryRel);
  if (src.includes(importSpec)) return false;
  const line = `import "${importSpec}";\n`;
  const tokenSpec = toImportSpec(dirname(previewRel), tokenFileRel);
  const tokenImportRe = new RegExp(`^import\\s+["']${tokenSpec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'];?\\s*$`, "m");
  const m = src.match(tokenImportRe);
  const next = m
    ? src.replace(tokenImportRe, `${line.trimEnd()}\n${m[0]}`)
    : insertAfterLastTopImport(src, line);
  await writeFile(previewPath, next, "utf8").catch(() => undefined);
  return true;
}

/** Build a relative ES import specifier from a directory to a file (posix, `./`-prefixed). */
function toImportSpec(fromDir: string, toFile: string): string {
  const rel = posix.normalize(relative(fromDir, toFile).split(/[\\/]/).join("/"));
  return rel.startsWith(".") ? rel : `./${rel}`;
}

/** Insert `line` after the last top-level import, or at the top if there are none. */
function insertAfterLastTopImport(src: string, line: string): string {
  const lines = src.split("\n");
  let lastImport = -1;
  for (let i = 0; i < lines.length; i++) if (/^import\b/.test(lines[i])) lastImport = i;
  if (lastImport < 0) return line + src;
  lines.splice(lastImport + 1, 0, line.trimEnd());
  return lines.join("\n");
}

const TSCONFIG_NAMES = ["tsconfig.json", "tsconfig.app.json", "tsconfig.base.json"];
const MAIN_NAMES = [".storybook/main.ts", ".storybook/main.js", ".storybook/main.mjs"];

/** Strip // and /* *​/ comments so a JSONC tsconfig can be JSON.parsed. */
function stripJsonComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Read `compilerOptions.paths` bare-alias → source dir from the project's tsconfig, e.g.
 * `{ "@/*": ["./src/*"] }` → `{ "@": "src" }`. Only single-target `<alias>/*` → `<dir>/*`
 * mappings are handled (the common case); anything else is skipped.
 */
async function readTsconfigAliases(projectPath: string): Promise<Record<string, string>> {
  const file = first(projectPath, TSCONFIG_NAMES);
  if (!file) return {};
  let json: unknown;
  try {
    json = JSON.parse(stripJsonComments(await readFile(join(projectPath, file), "utf8")));
  } catch {
    return {};
  }
  const paths = (json as { compilerOptions?: { paths?: Record<string, string[]> } })?.compilerOptions
    ?.paths;
  if (!paths) return {};
  const out: Record<string, string> = {};
  for (const [key, targets] of Object.entries(paths)) {
    if (!key.endsWith("/*") || !Array.isArray(targets) || !targets[0]?.endsWith("/*")) continue;
    const aliasKey = key.slice(0, -2); // "@/*" → "@"
    const dir = targets[0].slice(0, -2).replace(/^\.\//, ""); // "./src/*" → "src"
    out[aliasKey] = dir;
  }
  return out;
}

/**
 * Ensure Storybook's Vite build resolves the project's tsconfig path aliases (change:
 * storybook-alias-resolution). Vite does not read tsconfig paths, so a component that
 * imports `@/lib/utils` compiles under tsc but fails the Storybook build with "Failed to
 * resolve import". This mirrors each `@/*` alias into `.storybook/main`'s `viteFinal`.
 * Idempotent and conservative: only injects when the alias isn't already wired and the
 * file has a `const … ; export default …;` shape it can safely append to.
 */
export async function ensureStorybookAliases(
  projectPath: string,
): Promise<{ created: string[]; preExisting: string[] }> {
  const created: string[] = [];
  const preExisting: string[] = [];
  const aliases = await readTsconfigAliases(projectPath);
  if (Object.keys(aliases).length === 0) return { created, preExisting };

  const mainRel = first(projectPath, MAIN_NAMES);
  if (!mainRel) return { created, preExisting }; // no Storybook config yet — nothing to wire

  const mainPath = join(projectPath, mainRel);
  let src: string;
  try {
    src = await readFile(mainPath, "utf8");
  } catch {
    return { created, preExisting };
  }

  // Already wired (a viteFinal that sets resolve.alias) → leave it.
  if (/resolve\.alias/.test(src) || /viteFinal/.test(src)) {
    preExisting.push(`${mainRel} (vite alias)`);
    return { created, preExisting };
  }

  // Only safe to append when there's a named default export to attach viteFinal to.
  const exp = src.match(/export\s+default\s+([A-Za-z0-9_]+)\s*;/);
  if (!exp) return { created, preExisting }; // unusual shape — don't risk corrupting it

  const name = exp[1];
  const aliasEntries = Object.entries(aliases)
    .map(([k, dir]) => `    ${JSON.stringify(k)}: fileURLToPath(new URL(${JSON.stringify(`../${dir}`)}, import.meta.url)),`)
    .join("\n");
  let next = src;
  if (!/from ['"]node:url['"]/.test(next)) {
    next = insertAfterLastTopImport(next, `import { fileURLToPath } from "node:url";`);
  }
  const block =
    `${name}.viteFinal = async (viteConfig) => {\n` +
    `  viteConfig.resolve = viteConfig.resolve ?? {};\n` +
    `  viteConfig.resolve.alias = {\n    ...viteConfig.resolve.alias,\n${aliasEntries}\n  };\n` +
    `  return viteConfig;\n};\n`;
  next = next.replace(exp[0], `${block}${exp[0]}`);
  await writeFile(mainPath, next, "utf8").catch(() => undefined);
  created.push(`${mainRel} (vite alias)`);
  return { created, preExisting };
}
