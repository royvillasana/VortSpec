/**
 * The dev-server injection decision for the data-source stamp (change: instant-playground-edits,
 * issue #56). A pure helper so the risky spawn change in `dev-server.ts` is verified in isolation
 * first: given the project's package.json + chosen script, decide whether to run the project's
 * own Vite through the stamp WRAPPER config (`vite --config .vortspec/vite.stamp.mjs`) or fall
 * back to the raw `<pm> run <script>` (non-Vite projects, unchanged behaviour).
 *
 * Verified live: the generated wrapper loads the user's own config AND injects the stamp, and the
 * anchors land in the rendered DOM (Vite + React sample).
 */
import { stampWrapperConfig } from "./vite-plugin";

export const STAMP_WRAPPER_REL = ".vortspec/vite.stamp.mjs";

interface Pkg {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

/** Detect a Vite project: a dependency on `vite`, or a chosen script that runs vite. */
export function isViteProject(pkg: Pkg | null, script: string | null): boolean {
  if (!pkg) return false;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps.vite) return true;
  const cmd = script ? pkg.scripts?.[script] : undefined;
  return typeof cmd === "string" && /(^|\s|\/)vite(\s|$)/.test(cmd);
}

export interface StampInjection {
  /** Wrapper config to write (project-relative) before spawning. */
  wrapperPath: string;
  wrapperContent: string;
  /** The exec argv to spawn INSTEAD of `<pm> run <script>`. */
  argv: string[];
}

/** The runner that invokes a project-local binary, per package manager. */
function runnerFor(pm: string): string[] {
  switch (pm) {
    case "pnpm":
      return ["pnpm", "exec"];
    case "yarn":
      return ["yarn"]; // `yarn vite` runs the local binary
    case "bun":
      return ["bunx"];
    default:
      return ["npx"];
  }
}

/**
 * Compute the stamp injection for a Vite project, or `null` to fall back to the raw dev script.
 * `pluginModuleUrl` must be a path/URL the PROJECT's Vite process can import the plugin from
 * (the plugin resolves its own ts-morph from the installed `@vortspec/core`).
 */
export function viteStampInjection(opts: {
  projectPath: string;
  pm: string;
  pkg: Pkg | null;
  script: string | null;
  pluginModuleUrl: string;
  port?: number;
}): StampInjection | null {
  if (!isViteProject(opts.pkg, opts.script)) return null;
  const argv = [...runnerFor(opts.pm), "vite", "--config", STAMP_WRAPPER_REL];
  if (opts.port !== undefined) argv.push("--port", String(opts.port), "--strictPort");
  return {
    wrapperPath: STAMP_WRAPPER_REL,
    wrapperContent: stampWrapperConfig(opts.projectPath, opts.pluginModuleUrl),
    argv,
  };
}
