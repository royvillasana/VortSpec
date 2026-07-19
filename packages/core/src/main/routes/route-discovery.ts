import { readFile, readdir } from "node:fs/promises";
import { join, extname, relative } from "node:path";
import {
  buildRouteTree,
  buildScreenList,
  screenPreviewManifestSchema,
  type RouteDiscovery,
  type RouteNode,
  type ScreenPreviewManifest,
} from "../../shared/routes";

/**
 * Discover the app's page routes from source (change: sitemap-tree).
 *
 * Detects the router from package.json + directory layout, then reads the routes:
 * a Next.js `app/`/`pages/` directory (deterministic file-system mapping) or a
 * react-router config (best-effort source parse). Falls back to a single Home for a
 * router-less single-page app. Pure filesystem read — no code execution.
 */

const PAGE_EXTS = new Set([".tsx", ".jsx", ".ts", ".js"]);
/** Directories a route scan never descends into. */
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "out", ".turbo", "coverage"]);
const MAX_FILES = 4000;

async function exists(p: string): Promise<boolean> {
  try {
    await readdir(p);
    return true;
  } catch {
    return false;
  }
}

async function readPkg(projectPath: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(join(projectPath, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

/** All source files under a directory (bounded, skipping deps/build output). */
async function walkFiles(root: string, out: string[] = []): Promise<string[]> {
  if (out.length >= MAX_FILES) return out;
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (out.length >= MAX_FILES) break;
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    const full = join(root, e.name);
    if (e.isDirectory()) await walkFiles(full, out);
    else if (PAGE_EXTS.has(extname(e.name))) out.push(full);
  }
  return out;
}

/** Map a Next.js `app/` page file to its URL path. Route groups `(x)` drop out; `[p]`→`:p`. */
function nextAppPath(routeDir: string): { path: string; dynamic: boolean } {
  const segs = routeDir
    .split("/")
    .filter(Boolean)
    .filter((s) => !/^\(.*\)$/.test(s)) // route groups don't affect the URL
    .map((s) => s.replace(/^\[\.\.\.(.+)\]$/, ":$1*").replace(/^\[(.+)\]$/, ":$1"));
  const path = "/" + segs.join("/");
  return { path: path === "/" ? "/" : path.replace(/\/$/, ""), dynamic: /:/.test(path) };
}

/** Map a Next.js `pages/` file (sans dir prefix + ext) to its URL path. */
function nextPagesPath(rel: string): { path: string; dynamic: boolean } {
  let p = rel.replace(/\.(tsx|jsx|ts|js)$/, "");
  p = p.replace(/\/index$/, "").replace(/^index$/, "");
  const segs = p
    .split("/")
    .filter(Boolean)
    .map((s) => s.replace(/^\[\.\.\.(.+)\]$/, ":$1*").replace(/^\[(.+)\]$/, ":$1"));
  const path = "/" + segs.join("/");
  return { path: path === "/" ? "/" : path.replace(/\/$/, ""), dynamic: /:/.test(path) };
}

async function discoverNextApp(projectPath: string, appDir: string): Promise<RouteNode[]> {
  const root = join(projectPath, appDir);
  const files = await walkFiles(root);
  const entries: { path: string; file: string | null }[] = [];
  for (const f of files) {
    const base = f.slice(root.length + 1);
    if (!/(^|\/)page\.(tsx|jsx|ts|js)$/.test(base)) continue; // only page files are routes
    const routeDir = base.replace(/(^|\/)page\.(tsx|jsx|ts|js)$/, "");
    entries.push({ path: nextAppPath(routeDir).path, file: relative(projectPath, f) });
  }
  return buildRouteTree(entries);
}

async function discoverNextPages(projectPath: string, pagesDir: string): Promise<RouteNode[]> {
  const root = join(projectPath, pagesDir);
  const files = await walkFiles(root);
  const entries: { path: string; file: string | null }[] = [];
  for (const f of files) {
    const rel = f.slice(root.length + 1);
    const bare = rel.replace(/\.(tsx|jsx|ts|js)$/, "");
    if (/^_(app|document|error)$/.test(bare) || rel.startsWith("api/")) continue; // not pages
    entries.push({ path: nextPagesPath(rel).path, file: relative(projectPath, f) });
  }
  return buildRouteTree(entries);
}

/** Best-effort react-router parse: pull every `path` from `<Route path=…>` / `{ path: … }`. */
async function discoverReactRouter(projectPath: string): Promise<RouteNode[]> {
  const srcRoot = (await exists(join(projectPath, "src"))) ? join(projectPath, "src") : projectPath;
  const files = await walkFiles(srcRoot);
  const seen = new Map<string, string>(); // path → file
  const re = /(?:<Route\s+[^>]*?\bpath\s*=\s*|["']?path["']?\s*:\s*)["'`]([^"'`]*)["'`]/g;
  for (const f of files) {
    let text: string;
    try {
      text = await readFile(f, "utf8");
    } catch {
      continue;
    }
    if (!/react-router|<Route|createBrowserRouter|useRoutes/.test(text)) continue;
    for (const m of text.matchAll(re)) {
      let p = m[1].trim();
      if (p === "*" || p === "") continue; // catch-all / index — skip the wildcard
      if (!p.startsWith("/")) p = "/" + p; // relative nested paths → best-effort absolute
      p = p.replace(/\/+$/, "") || "/";
      if (!seen.has(p)) seen.set(p, relative(projectPath, f));
    }
  }
  return buildRouteTree([...seen].map(([path, file]) => ({ path, file })));
}

export async function discoverRoutes(projectPath: string): Promise<RouteDiscovery> {
  const pkg = await readPkg(projectPath);
  const deps = { ...(pkg?.dependencies as object), ...(pkg?.devDependencies as object) } as Record<string, string>;
  const has = (name: string): boolean => name in deps;

  // Next.js — file-system routing (app dir preferred, then pages).
  if (has("next")) {
    for (const appDir of ["app", "src/app"]) {
      if (await exists(join(projectPath, appDir))) {
        const routes = await discoverNextApp(projectPath, appDir);
        if (routes.length) return { router: "next-app", routes, note: null };
      }
    }
    for (const pagesDir of ["pages", "src/pages"]) {
      if (await exists(join(projectPath, pagesDir))) {
        const routes = await discoverNextPages(projectPath, pagesDir);
        if (routes.length) return { router: "next-pages", routes, note: null };
      }
    }
  }

  // react-router — parse the route config from source.
  if (has("react-router-dom") || has("react-router")) {
    const routes = await discoverReactRouter(projectPath);
    if (routes.length)
      return {
        router: "react-router",
        routes,
        note: routes[0]?.children.length ? null : "Only the root route was found — react-router config parsing is best-effort.",
      };
    return { router: "react-router", routes: [], note: "react-router is present but no <Route path> was found in source." };
  }

  // No router — a single-page app. Point Home at the entry file, and list any
  // state-navigated screen files so they're visible/openable even without a URL.
  const entry =
    (await firstExisting(projectPath, ["src/App.tsx", "src/App.jsx", "src/main.tsx", "src/main.jsx", "src/index.tsx", "App.tsx"])) ??
    null;
  const home: RouteNode = { path: "/", label: "Home", file: entry, dynamic: false, navigable: !!entry, children: [] };
  const screens = await discoverScreenFiles(projectPath);
  if (screens.length) {
    const manifest = await readScreenPreviewManifest(projectPath);
    return {
      router: "none",
      routes: buildScreenList(home, screens, manifest),
      note: manifest
        ? "State-navigated screens (no URL). Click one to preview it standalone in the live canvas."
        : "State-navigated screens have no URL. Enable screen preview to render them standalone; until then, click one to open its source.",
      screenPreview: { enabled: !!manifest, param: manifest?.param ?? "screen" },
    };
  }
  return {
    router: "none",
    routes: [home],
    note: "No router detected — this looks like a single-page app. Add routing to see more pages here.",
  };
}

/** Read the dev-only screen-preview harness manifest, if the app has installed one. */
async function readScreenPreviewManifest(projectPath: string): Promise<ScreenPreviewManifest | null> {
  try {
    const raw = JSON.parse(await readFile(join(projectPath, ".vortspec/screen-preview.json"), "utf8"));
    const parsed = screenPreviewManifestSchema.parse(raw);
    return parsed.screens.length ? parsed : null;
  } catch {
    return null;
  }
}

/** Split a PascalCase/camelCase name into readable words: `DestinationDetail` → `Destination detail`. */
function humanizeScreenName(name: string): string {
  const spaced = name.replace(/[-_]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase() : name;
}

/**
 * Screen component files a state-navigated app renders without a router — the `screens/`,
 * `pages/`, or `views/` directory. Excludes tests/stories and barrel `index` files.
 */
async function discoverScreenFiles(projectPath: string): Promise<{ label: string; file: string; name: string }[]> {
  const dirs = ["src/screens", "src/pages", "src/views", "screens", "pages", "views"];
  const out: { label: string; file: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const d of dirs) {
    const root = join(projectPath, d);
    if (!(await exists(root))) continue;
    for (const f of await walkFiles(root)) {
      const bare = f.slice(root.length + 1).replace(/\.(tsx|jsx|ts|js)$/, "");
      const last = bare.split("/").pop() ?? bare;
      if (/\.(test|spec|stories)$/.test(bare) || last === "index" || !/^[A-Z]/.test(last)) continue;
      const rel = relative(projectPath, f);
      if (seen.has(rel)) continue;
      seen.add(rel);
      out.push({ label: humanizeScreenName(last), file: rel, name: last });
    }
  }
  return out;
}

async function firstExisting(projectPath: string, rels: string[]): Promise<string | null> {
  for (const rel of rels) {
    try {
      await readFile(join(projectPath, rel), "utf8");
      return rel;
    } catch {
      /* next */
    }
  }
  return null;
}
