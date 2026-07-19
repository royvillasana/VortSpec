import { z } from "zod";

/**
 * The app's page/route sitemap, discovered from source (change: sitemap-tree).
 *
 * VortSpec reads the project's router — Next.js `app/`/`pages/`, or a react-router
 * config — to list the pages the running app can show, so the Playground can render
 * a navigable tree of screens. Pure data: the main process derives it from files on
 * disk; the renderer renders it and navigates the preview webview to a route's URL.
 */

/** Which router the routes were discovered from (drives how a route maps to a URL). */
export const routerKindSchema = z.enum(["next-app", "next-pages", "react-router", "none"]);
export type RouterKind = z.infer<typeof routerKindSchema>;

export interface RouteNode {
  /** URL path (`/about`), or a synthetic `#screen/…` id for a state-navigated screen. */
  path: string;
  /** Display label — the last segment humanized, or "Home" for `/`. */
  label: string;
  /** Project-relative source file that defines the page/screen, when known. */
  file: string | null;
  /** Whether the path has a dynamic segment (`:param` / `[param]`) — not directly navigable. */
  dynamic: boolean;
  /**
   * True → clicking navigates the preview to this URL. False → a state-navigated screen
   * (no URL) or a page-less branch; clicking opens its source file instead.
   */
  navigable: boolean;
  children: RouteNode[];
}

export const routeNodeSchema: z.ZodType<RouteNode> = z.lazy(() =>
  z.object({
    path: z.string(),
    label: z.string(),
    file: z.string().nullable(),
    dynamic: z.boolean(),
    navigable: z.boolean(),
    children: z.array(routeNodeSchema),
  }),
);

/**
 * A router-less app's dev-only screen-preview harness, declared by
 * `.vortspec/screen-preview.json`. Present once the harness is installed; it lets
 * VortSpec render a state-navigated screen standalone by navigating to `?<param>=<name>`.
 */
export interface ScreenPreviewManifest {
  /** URL query param the harness reads to pick a screen (e.g. "screen"). */
  param: string;
  /** Screens the harness can render, by component name + source file. */
  screens: { name: string; file: string }[];
}

export const screenPreviewManifestSchema = z.object({
  param: z.string().default("screen"),
  screens: z.array(z.object({ name: z.string(), file: z.string() })).default([]),
});

export const routeDiscoverySchema = z.object({
  router: routerKindSchema,
  /** The route tree (roots). Empty when nothing could be discovered. */
  routes: z.array(routeNodeSchema).default([]),
  /** A human note when discovery is partial/empty (e.g. "no router — single-page app"). */
  note: z.string().nullable().default(null),
  /**
   * For a router-less app with state-navigated screens: whether a dev-only screen-preview
   * harness is installed (so screens are navigable), and the URL param it reads. Absent when
   * the app has no such screens (nothing to preview).
   */
  screenPreview: z.object({ enabled: z.boolean(), param: z.string() }).optional(),
});
export type RouteDiscovery = z.infer<typeof routeDiscoverySchema>;

/** Humanize a path segment for display: `user-settings` → `User settings`, `[slug]` → `:slug`. */
export function humanizeSegment(seg: string): string {
  const dyn = seg.replace(/^\[\.{0,3}(.+?)\]$/, ":$1").replace(/^:(.+)/, ":$1");
  if (dyn.startsWith(":")) return dyn;
  const words = seg.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : seg;
}

/**
 * Build a nested route tree from a flat list of `{ path, file }` entries, splitting on
 * `/`. Intermediate segments with no page of their own become label-only branch nodes.
 */
export function buildRouteTree(entries: { path: string; file: string | null }[]): RouteNode[] {
  const root: RouteNode = { path: "/", label: "Home", file: null, dynamic: false, navigable: false, children: [] };
  const byPath = new Map<string, RouteNode>([["/", root]]);

  const ensure = (path: string): RouteNode => {
    const existing = byPath.get(path);
    if (existing) return existing;
    const segs = path.split("/").filter(Boolean);
    const parentPath = "/" + segs.slice(0, -1).join("/");
    const parent = ensure(parentPath === "/" ? "/" : parentPath.replace(/\/$/, ""));
    const last = segs[segs.length - 1] ?? "";
    const node: RouteNode = {
      path,
      label: segs.length ? humanizeSegment(last) : "Home",
      file: null,
      dynamic: /:|\[/.test(path),
      navigable: false, // a branch is navigable only once a real page file attaches
      children: [],
    };
    parent.children.push(node);
    byPath.set(path, node);
    return node;
  };

  for (const e of entries) {
    const norm = e.path === "" ? "/" : e.path.replace(/\/+$/, "") || "/";
    const node = ensure(norm);
    node.file = e.file;
    node.dynamic = /:|\[/.test(norm);
    node.navigable = !!e.file && !node.dynamic; // a real, static URL is navigable
  }
  const sortRec = (n: RouteNode): void => {
    n.children.sort((a, b) => a.path.localeCompare(b.path));
    n.children.forEach(sortRec);
  };
  sortRec(root);
  return root.file || root.children.length ? [root] : [];
}

/**
 * Build sitemap nodes for STATE-navigated screens (no router — a screen file the app
 * renders on some app state). Listed under the running app's Home. When a screen-preview
 * harness is installed (manifest lists the screen), the node is navigable via `?param=name`
 * so the preview renders it standalone; otherwise it opens the source file.
 */
export function buildScreenList(
  home: RouteNode,
  screens: { label: string; file: string; name: string }[],
  manifest: ScreenPreviewManifest | null,
): RouteNode[] {
  const previewable = new Set(manifest?.screens.map((s) => s.name) ?? []);
  const param = manifest?.param ?? "screen";
  const kids: RouteNode[] = screens
    .map((s) => {
      const canPreview = previewable.has(s.name);
      return {
        // Navigable → a query the harness reads; otherwise a synthetic id that opens the file.
        path: canPreview ? `?${param}=${encodeURIComponent(s.name)}` : `#screen/${s.file}`,
        label: s.label,
        file: s.file,
        dynamic: false,
        navigable: canPreview,
        children: [] as RouteNode[],
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
  return [{ ...home, children: [...home.children, ...kids] }];
}
