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
  /** URL path, e.g. `/`, `/about`, `/blog/:slug`. */
  path: string;
  /** Display label — the last segment humanized, or "Home" for `/`. */
  label: string;
  /** Project-relative source file that defines the page, when known. */
  file: string | null;
  /** Whether the path has a dynamic segment (`:param` / `[param]`) — not directly navigable. */
  dynamic: boolean;
  children: RouteNode[];
}

export const routeNodeSchema: z.ZodType<RouteNode> = z.lazy(() =>
  z.object({
    path: z.string(),
    label: z.string(),
    file: z.string().nullable(),
    dynamic: z.boolean(),
    children: z.array(routeNodeSchema),
  }),
);

export const routeDiscoverySchema = z.object({
  router: routerKindSchema,
  /** The route tree (roots). Empty when nothing could be discovered. */
  routes: z.array(routeNodeSchema).default([]),
  /** A human note when discovery is partial/empty (e.g. "no router — single-page app"). */
  note: z.string().nullable().default(null),
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
  const root: RouteNode = { path: "/", label: "Home", file: null, dynamic: false, children: [] };
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
  }
  // Only surface `/` as a root when it has a file or children.
  const sortRec = (n: RouteNode): void => {
    n.children.sort((a, b) => a.path.localeCompare(b.path));
    n.children.forEach(sortRec);
  };
  sortRec(root);
  return root.file || root.children.length ? [root] : [];
}
