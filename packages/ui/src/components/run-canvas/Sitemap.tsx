import { useState } from "react";
import type { JSX } from "react";
import { ChevronRight, ChevronDown, House, FileCode } from "lucide-react";
import type { RouteDiscovery, RouteNode } from "@vortspec/core/ipc";

/**
 * The sitemap tree (change: sitemap-tree).
 *
 * Renders the app's pages/routes — discovered from source (Next.js file routes or a
 * react-router config) — as a navigable tree in the Playground. Clicking a page
 * navigates the preview to that route's URL; dynamic (`:param`) routes and structural
 * branch nodes (no page file of their own) are shown but not directly navigable.
 */
export function Sitemap({
  discovery,
  currentPath,
  onNavigate,
}: {
  discovery: RouteDiscovery | null;
  /** The route currently shown in the preview (highlighted). */
  currentPath: string;
  /** Navigate the preview to a route path. */
  onNavigate: (path: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(true);
  const count = discovery ? countRoutes(discovery.routes) : 0;
  return (
    <section className="border-b border-vs-border-subtle" data-testid="sitemap">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-vs-text-secondary hover:text-vs-text-primary"
      >
        <span className="text-[9px] text-vs-text-muted">{open ? "▾" : "▸"}</span>
        Pages{count > 0 ? ` · ${count}` : ""}
      </button>
      {open && (
        <div className="max-h-56 overflow-y-auto pb-1">
          {!discovery ? (
            <p className="px-3 py-2 text-[11px] text-vs-text-muted">Reading routes…</p>
          ) : discovery.routes.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-vs-text-muted">{discovery.note ?? "No pages found."}</p>
          ) : (
            <>
              {discovery.routes.map((r) => (
                <RouteRow key={r.path} node={r} depth={0} currentPath={currentPath} onNavigate={onNavigate} />
              ))}
              {discovery.note && (
                <p className="px-3 pt-1.5 text-[10px] leading-snug text-vs-text-muted">{discovery.note}</p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function RouteRow({
  node,
  depth,
  currentPath,
  onNavigate,
}: {
  node: RouteNode;
  depth: number;
  currentPath: string;
  onNavigate: (path: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const active = node.path === currentPath;
  // A page is navigable when it has a real file and no dynamic segment.
  const navigable = !!node.file && !node.dynamic;
  const isHome = node.path === "/";
  return (
    <div>
      <div
        className={`group flex items-center gap-1 pr-2 text-[12px] ${
          active ? "bg-vs-accent-subtle text-vs-accent" : "text-vs-text-secondary hover:bg-vs-bg-hover"
        }`}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <button
          type="button"
          aria-label={open ? "Collapse" : "Expand"}
          onClick={() => setOpen((v) => !v)}
          className={`flex-none rounded p-0.5 ${hasChildren ? "text-vs-text-muted hover:text-vs-text-primary" : "invisible"}`}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <button
          type="button"
          disabled={!navigable}
          title={navigable ? node.path : node.dynamic ? `${node.path} (dynamic — needs a param)` : `${node.path} (no page)`}
          onClick={() => navigable && onNavigate(node.path)}
          className={`flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left ${
            navigable ? "hover:text-vs-text-primary" : "cursor-default text-vs-text-muted"
          }`}
        >
          {isHome ? <House size={13} className="flex-none" /> : <FileCode size={13} className="flex-none opacity-70" />}
          <span className="truncate">{node.label}</span>
          {node.dynamic && <span className="flex-none rounded bg-vs-bg-hover px-1 text-[9px] text-vs-text-muted">dynamic</span>}
        </button>
      </div>
      {open && hasChildren && (
        <div>
          {node.children.map((c) => (
            <RouteRow key={c.path} node={c} depth={depth + 1} currentPath={currentPath} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function countRoutes(nodes: RouteNode[]): number {
  return nodes.reduce((n, r) => n + (r.file ? 1 : 0) + countRoutes(r.children), 0);
}
