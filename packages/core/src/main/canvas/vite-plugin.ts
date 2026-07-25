/**
 * The dev-only Vite plugin that stamps `data-source` into the project's rendered DOM
 * (change: instant-playground-edits, Approach A). It runs `stampDataSource` on the project's
 * own `.jsx`/`.tsx` in `serve` mode only, so anchors appear in dev and NEVER in a production
 * build. VortSpec injects it into the project's own Vite via a wrapper config (below) — the
 * project's build config is not edited on disk.
 *
 * The plugin runs INSIDE the project's Vite process; it resolves `stampDataSource` (and its
 * ts-morph) from this installed `@vortspec/core`, so the project needs no new dependency.
 */
import { relative } from "node:path";
import { stampDataSource } from "./stamp-source";

/** A minimal structural type for a Vite plugin, so `@vortspec/core` needs no `vite` dependency. */
export interface VitePluginLike {
  name: string;
  apply?: "serve" | "build";
  enforce?: "pre" | "post";
  transform?: (code: string, id: string) => { code: string; map: null } | null;
}

export function vortspecSourceStamp(opts?: { root?: string }): VitePluginLike {
  const root = opts?.root ?? process.cwd();
  return {
    name: "vortspec:source-stamp",
    apply: "serve", // dev only — never runs in `vite build`, so nothing ships to production
    enforce: "pre", // before the React JSX compile, so we stamp JSX source, not compiled output
    transform(code, id) {
      const file = id.split("?")[0];
      if (!/\.[jt]sx$/.test(file)) return null;
      if (file.includes("/node_modules/")) return null;
      const out = stampDataSource(code, relative(root, file));
      // Anchors are recorded in ORIGINAL-source coordinates and the codemods read the file
      // from disk, so a source map for the stamped code isn't needed for the round-trip.
      return out === code ? null : { code: out, map: null };
    },
  };
}

/**
 * Generate a wrapper Vite config that loads the project's own config and appends the stamp
 * plugin — so VortSpec can run `vite --config <this>` in dev without editing the project's
 * `vite.config`. `pluginModuleUrl` is a file:// URL (or absolute path) to this module, resolved
 * from VortSpec's install so its ts-morph is available in the project's Vite process.
 */
export function stampWrapperConfig(projectRoot: string, pluginModuleUrl: string): string {
  const root = JSON.stringify(projectRoot);
  return `import { mergeConfig, loadConfigFromFile } from "vite";
import { vortspecSourceStamp } from ${JSON.stringify(pluginModuleUrl)};

// VortSpec dev wrapper (instant-playground-edits): the project's own config + the source stamp.
export default async (env) => {
  const loaded = await loadConfigFromFile(env, undefined, ${root});
  const base = loaded?.config ?? {};
  return mergeConfig(base, { plugins: [vortspecSourceStamp({ root: ${root} })] });
};
`;
}
