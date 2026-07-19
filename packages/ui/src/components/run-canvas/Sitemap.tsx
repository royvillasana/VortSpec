import { useState } from "react";
import type { JSX } from "react";
import { ChevronRight, ChevronDown, House, FileCode, Sparkles, Loader2 } from "lucide-react";
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
  onOpenFile,
  onRetryScreenPreview,
  screenPreviewState,
}: {
  discovery: RouteDiscovery | null;
  /** The route currently shown in the preview (highlighted). */
  currentPath: string;
  /** Navigate the preview to a route path. */
  onNavigate: (path: string) => void;
  /** Open a screen's source file (for state-navigated screens that have no URL). */
  onOpenFile?: (file: string) => void;
  /** Retry the harness setup after a failure (setup is otherwise automatic). */
  onRetryScreenPreview?: () => void;
  /** Progress of the automatic screen-preview setup, while it isn't yet enabled. */
  screenPreviewState?: "setting-up" | "failed";
}): JSX.Element {
  const [open, setOpen] = useState(true);
  const count = discovery ? countRoutes(discovery.routes) : 0;
  // A router-less app has state-navigated screens whose preview harness isn't installed yet.
  // Setup runs automatically; surface its progress (and a retry only if it failed).
  const settingUpPreview = !!discovery?.screenPreview && !discovery.screenPreview.enabled;
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
                <RouteRow
                  key={r.path}
                  node={r}
                  depth={0}
                  currentPath={currentPath}
                  onNavigate={onNavigate}
                  onOpenFile={onOpenFile}
                />
              ))}
              {discovery.note && (
                <p className="px-3 pt-1.5 text-[10px] leading-snug text-vs-text-muted">{discovery.note}</p>
              )}
              {settingUpPreview &&
                (screenPreviewState === "failed" ? (
                  <button
                    type="button"
                    onClick={() => onRetryScreenPreview?.()}
                    className="mx-3 mt-1.5 flex items-center gap-1.5 rounded border border-vs-border-subtle px-2 py-1 text-[11px] text-vs-accent hover:bg-vs-bg-hover"
                    data-testid="retry-screen-preview"
                  >
                    <Sparkles size={12} /> Screen preview setup failed — retry
                  </button>
                ) : (
                  <p
                    className="mx-3 mt-1.5 flex items-center gap-1.5 text-[11px] text-vs-text-muted"
                    data-testid="screen-preview-setup"
                  >
                    <Loader2 size={12} className="animate-spin" /> Setting up screen preview…
                  </p>
                ))}
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
  onOpenFile,
}: {
  node: RouteNode;
  depth: number;
  currentPath: string;
  onNavigate: (path: string) => void;
  onOpenFile?: (file: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const active = node.path === currentPath;
  // A navigable page navigates the preview; a state-navigated screen (has a file but
  // no URL) opens its source; a page-less branch does nothing.
  const navigable = node.navigable;
  const openable = !navigable && !!node.file && !!onOpenFile;
  const clickable = navigable || openable;
  const isHome = node.path === "/";
  // A state-navigated screen: either navigable via `?param=name` or file-only via `#screen/…`.
  const isScreen = node.path.startsWith("#screen/") || node.path.startsWith("?");
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
          disabled={!clickable}
          title={
            navigable
              ? isScreen
                ? `Preview ${node.label} standalone`
                : node.path
              : openable
                ? `Open source — ${node.file}`
                : node.dynamic
                  ? `${node.path} (dynamic — needs a param)`
                  : `${node.path} (no page)`
          }
          onClick={() => (navigable ? onNavigate(node.path) : openable ? onOpenFile!(node.file!) : undefined)}
          className={`flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left ${
            clickable ? "hover:text-vs-text-primary" : "cursor-default text-vs-text-muted"
          }`}
        >
          {isHome ? <House size={13} className="flex-none" /> : <FileCode size={13} className="flex-none opacity-70" />}
          <span className="truncate">{node.label}</span>
          {node.dynamic && <span className="flex-none rounded bg-vs-bg-hover px-1 text-[9px] text-vs-text-muted">dynamic</span>}
          {isScreen && (
            <span className="flex-none rounded bg-vs-bg-hover px-1 text-[9px] text-vs-text-muted">screen</span>
          )}
        </button>
      </div>
      {open && hasChildren && (
        <div>
          {node.children.map((c) => (
            <RouteRow
              key={c.path}
              node={c}
              depth={depth + 1}
              currentPath={currentPath}
              onNavigate={onNavigate}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function countRoutes(nodes: RouteNode[]): number {
  return nodes.reduce((n, r) => n + (r.file ? 1 : 0) + countRoutes(r.children), 0);
}
