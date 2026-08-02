import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import type { BridgeTree, BridgeNode } from "@vortspec/core/ipc";

/**
 * The ids a layer-search should render: every node whose name or hint matches, PLUS their ancestors so a
 * match's place in the hierarchy stays readable. `null` means "not filtering", which is deliberately
 * distinct from "filtering and nothing matched" (an empty set) — the caller renders a different thing.
 *
 * Exported so the matching rule can be tested directly rather than through a rendered tree.
 */
export function visibleForFilter(tree: BridgeTree | null, filter: string): Set<string> | null {
  const q = filter.trim().toLowerCase();
  if (!q || !tree) return null;
  const parentOf = new Map<string, string>();
  for (const [pid, kids] of Object.entries(tree.children)) for (const k of kids) parentOf.set(k, pid);
  const keep = new Set<string>();
  for (const [id, node] of Object.entries(tree.nodes)) {
    const name = node.component ?? node.tag;
    const hint = node.idAttr ?? node.classes[0] ?? "";
    if (!name.toLowerCase().includes(q) && !hint.toLowerCase().includes(q)) continue;
    keep.add(id);
    for (let p = parentOf.get(id); p; p = parentOf.get(p)) keep.add(p);
  }
  return keep;
}

/**
 * The Layers region of the Run-section Design panel (change: run-canvas-visual-editor).
 *
 * Renders the rendered page's component/DOM node tree from a flat `BridgeTree`
 * (id→node, id→child-ids), mirroring the Explorer's flat-map + `Set` expand +
 * depth-padded recursive render so the two trees behave identically. Selection is
 * lifted (the canvas and this tree cross-highlight), expand state is local.
 */
export const NodeTree = memo(function NodeTree({
  tree,
  selectedId,
  selectedIds,
  hoveredId,
  onSelect,
  onHover,
  onReorder,
  filter = "",
}: {
  tree: BridgeTree | null;
  selectedId: string | null;
  /** The whole selection. Defaults to just the focused member, so a caller that has not adopted
   *  multi-select keeps today's behaviour exactly. */
  selectedIds?: string[];
  hoveredId?: string | null;
  onSelect: (id: string, additive?: boolean) => void;
  onHover?: (id: string | null) => void;
  /** Drag a layer: `before`/`after` reorders; `inside` nests it into the target container. */
  onReorder?: (nodeId: string, targetId: string, position: "before" | "after" | "inside") => void;
  /**
   * Narrow the tree to nodes whose name matches, so a layer can be reached by typing instead of by
   * scrolling and expanding — a real screen's tree runs to dozens of nodes. Ancestors of a match stay
   * visible so the match's place in the hierarchy is still readable.
   */
  filter?: string;
}): JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  // Drag state: the row being dragged, and the current drop target + zone (before/after reorder, or
  // inside = nest into that container).
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; pos: "before" | "after" | "inside" } | null>(null);

  // child id → parent id, so we can reveal a node selected on the canvas.
  const parentOf = useMemo(() => {
    const map = new Map<string, string>();
    if (tree) for (const [pid, kids] of Object.entries(tree.children)) for (const k of kids) map.set(k, pid);
    return map;
  }, [tree]);

  const visible = useMemo(() => visibleForFilter(tree, filter), [tree, filter]);

  // When the selection changes (e.g. clicking an element on the canvas), expand the
  // whole ancestor chain so the highlighted row is actually visible, then scroll to it.
  useEffect(() => {
    if (!selectedId) return;
    const ancestors: string[] = [];
    for (let p = parentOf.get(selectedId); p; p = parentOf.get(p)) ancestors.push(p);
    if (ancestors.length) {
      setExpanded((prev) => {
        if (ancestors.every((a) => prev.has(a))) return prev;
        return new Set([...prev, ...ancestors]);
      });
    }
  }, [selectedId, parentOf]);

  // Scroll the selected row into view once it's rendered (after any expansion).
  useEffect(() => {
    if (selectedId && selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [selectedId, expanded]);

  function toggle(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (!tree || tree.roots.length === 0) {
    return (
      <p className="px-3 py-2 text-[11px] text-vs-text-muted">
        No elements yet — run the app to inspect its layers.
      </p>
    );
  }

  if (visible && visible.size === 0) {
    return <p className="px-3 py-2 text-[11px] text-vs-text-muted">No layer matches “{filter.trim()}”.</p>;
  }

  function renderNode(id: string, depth: number): JSX.Element[] {
    const node = tree!.nodes[id];
    if (!node) return [];
    // Filtering renders only matches and their ancestors.
    if (visible && !visible.has(id)) return [];
    const kids = tree!.children[id] ?? [];
    const hasKids = kids.length > 0 || node.childCount > 0;
    // Can this row accept a nested child? Anything that already has children, or a container-category
    // element (a div/section/nav/… — even an empty one you want to drop the first child into).
    const canNest = hasKids || NESTABLE_GROUPS.has(TAG_GROUP[node.tag] ?? "");
    // While filtering, the surviving branches are always open — a match the user must expand to
    // see would defeat the search.
    const isOpen = expanded.has(id) || !!visible;
    // `isSelected` drives the row's highlight; the focused member is drawn distinctly below, because a
    // set of five where one is the panel's subject has to say which one.
    const isSelected = selectedIds ? selectedIds.includes(id) : selectedId === id;
    const isFocused = selectedId === id;
    const dropHere = dropAt?.id === id ? dropAt.pos : null;
    const row = (
      <button
        key={id}
        ref={isFocused ? selectedRef : undefined}
        type="button"
        draggable={!!onReorder}
        onClick={(e) => onSelect(id, e.shiftKey || e.metaKey || e.ctrlKey)}
        onMouseEnter={() => onHover?.(id)}
        onMouseLeave={() => onHover?.(null)}
        onDragStart={
          onReorder
            ? (e) => {
                setDragId(id);
                e.dataTransfer.effectAllowed = "move";
                // Firefox needs data set for a drag to start.
                e.dataTransfer.setData("text/plain", id);
              }
            : undefined
        }
        onDragOver={
          onReorder
            ? (e) => {
                if (!dragId || dragId === id) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const r = e.currentTarget.getBoundingClientRect();
                const frac = (e.clientY - r.top) / r.height;
                // A container gets three zones — top band = before, middle = nest INSIDE, bottom = after.
                // A leaf splits 50/50 before/after (nothing to nest into).
                const pos: "before" | "after" | "inside" = canNest
                  ? frac < 0.28
                    ? "before"
                    : frac > 0.72
                      ? "after"
                      : "inside"
                  : frac < 0.5
                    ? "before"
                    : "after";
                setDropAt((cur) => (cur?.id === id && cur.pos === pos ? cur : { id, pos }));
              }
            : undefined
        }
        onDrop={
          onReorder
            ? (e) => {
                e.preventDefault();
                if (dragId && dragId !== id && dropAt?.id === id) onReorder(dragId, id, dropAt.pos);
                setDragId(null);
                setDropAt(null);
              }
            : undefined
        }
        onDragEnd={
          onReorder
            ? () => {
                setDragId(null);
                setDropAt(null);
              }
            : undefined
        }
        style={{ paddingLeft: 6 + depth * 12 }}
        className={`relative flex w-full items-center gap-1 py-[3px] pr-2 text-left text-[12px] ${
          dragId === id ? "opacity-40" : ""
        } ${
          dropHere === "inside" ? "ring-1 ring-inset ring-vs-accent bg-vs-accent-subtle" : ""
        } ${
          isSelected
            ? `bg-vs-accent-subtle text-vs-text-primary${isFocused ? " ring-1 ring-inset ring-vs-accent" : ""}`
            : hoveredId === id
              ? "bg-vs-bg-hover text-vs-text-primary"
              : "text-vs-text-secondary hover:bg-vs-bg-hover"
        }`}
      >
        {/* Drop indicator: a line at the top/bottom edge for reorder; the whole row is ringed for a
            nest (drop INSIDE the container). */}
        {(dropHere === "before" || dropHere === "after") && (
          <span
            aria-hidden
            className={`pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-vs-accent ${
              dropHere === "before" ? "top-0" : "bottom-0"
            }`}
          />
        )}
        <span
          role={hasKids ? "button" : undefined}
          onClick={
            hasKids
              ? (e) => {
                  e.stopPropagation();
                  toggle(id);
                }
              : undefined
          }
          className="inline-flex w-3 flex-none justify-center text-[9px] text-vs-text-muted"
        >
          {hasKids ? (isOpen ? "▾" : "▸") : ""}
        </span>
        <NodeLabel node={node} />
      </button>
    );
    if (!isOpen) return [row];
    return [row, ...kids.flatMap((k) => renderNode(k, depth + 1))];
  }

  return <div className="py-1">{tree.roots.flatMap((r) => renderNode(r, 0))}</div>;
});

/** A Figma-layers-style label: a per-type icon, the component name (if any) else tag, and a class hint. */
function NodeLabel({ node }: { node: BridgeNode }): JSX.Element {
  const name = node.component ?? node.tag;
  const hint = node.idAttr ? `#${node.idAttr}` : node.classes[0] ? `.${node.classes[0]}` : "";
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <NodeIcon node={node} />
      <span className="truncate font-medium">{name}</span>
      {hint && <span className="truncate text-[10px] text-vs-text-muted">{hint}</span>}
    </span>
  );
}

const ICON_CLS = "h-3 w-3 flex-none text-vs-text-muted";

/** A stroked 14×14 icon wrapper (currentColor). */
function Stroke({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <svg
      viewBox="0 0 14 14"
      className={ICON_CLS}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** Icon categories whose elements can hold nested children (accept an "inside" drop even when empty). */
const NESTABLE_GROUPS = new Set(["container", "section", "nav", "bar", "form", "list", "table"]);

/** Tag → icon category. */
const TAG_GROUP: Record<string, string> = {
  div: "container",
  main: "container",
  article: "container",
  figure: "container",
  aside: "container",
  section: "section",
  p: "text",
  span: "text",
  label: "text",
  small: "text",
  strong: "text",
  em: "text",
  b: "text",
  i: "text",
  blockquote: "text",
  code: "text",
  td: "text",
  th: "text",
  button: "button",
  a: "link",
  img: "image",
  picture: "image",
  svg: "image",
  video: "image",
  canvas: "image",
  ul: "list",
  ol: "list",
  dl: "list",
  li: "listitem",
  dt: "listitem",
  dd: "listitem",
  tr: "listitem",
  input: "input",
  textarea: "input",
  select: "input",
  nav: "nav",
  header: "bar",
  footer: "bar",
  form: "form",
  table: "table",
};

const GROUP_ICON: Record<string, JSX.Element> = {
  container: (
    <Stroke>
      <rect x="2.5" y="2.5" width="9" height="9" rx="1.5" />
    </Stroke>
  ),
  section: (
    <Stroke>
      <rect x="2.5" y="2.5" width="9" height="9" rx="1" />
      <line x1="2.5" y1="5.5" x2="11.5" y2="5.5" />
    </Stroke>
  ),
  text: (
    <Stroke>
      <line x1="3" y1="4" x2="11" y2="4" />
      <line x1="3" y1="7" x2="11" y2="7" />
      <line x1="3" y1="10" x2="8" y2="10" />
    </Stroke>
  ),
  button: (
    <Stroke>
      <rect x="2" y="4.5" width="10" height="5" rx="2.5" />
    </Stroke>
  ),
  link: (
    <Stroke>
      <path d="M8.4 5.6 9.6 4.4a2.1 2.1 0 0 1 3 3L11.4 8.6" />
      <path d="M5.6 8.4 4.4 9.6a2.1 2.1 0 0 1-3-3L2.6 5.4" />
      <line x1="5.5" y1="8.5" x2="8.5" y2="5.5" />
    </Stroke>
  ),
  image: (
    <Stroke>
      <rect x="2" y="2.5" width="10" height="9" rx="1.5" />
      <circle cx="5" cy="5.5" r="1" />
      <path d="M2.5 10.5 5.5 7.5l2 2 2-2.5 2 2.5" />
    </Stroke>
  ),
  list: (
    <Stroke>
      <circle cx="3.4" cy="4" r="0.7" fill="currentColor" stroke="none" />
      <line x1="6" y1="4" x2="11.5" y2="4" />
      <circle cx="3.4" cy="7" r="0.7" fill="currentColor" stroke="none" />
      <line x1="6" y1="7" x2="11.5" y2="7" />
      <circle cx="3.4" cy="10" r="0.7" fill="currentColor" stroke="none" />
      <line x1="6" y1="10" x2="11.5" y2="10" />
    </Stroke>
  ),
  listitem: (
    <Stroke>
      <circle cx="3.4" cy="7" r="0.9" fill="currentColor" stroke="none" />
      <line x1="6" y1="7" x2="11" y2="7" />
    </Stroke>
  ),
  input: (
    <Stroke>
      <rect x="2" y="5" width="10" height="4" rx="1" />
      <line x1="4" y1="6.3" x2="4" y2="7.7" />
    </Stroke>
  ),
  nav: (
    <Stroke>
      <line x1="3" y1="4" x2="11" y2="4" />
      <line x1="3" y1="7" x2="11" y2="7" />
      <line x1="3" y1="10" x2="11" y2="10" />
    </Stroke>
  ),
  bar: (
    <Stroke>
      <rect x="2" y="4.5" width="10" height="5" rx="1" />
    </Stroke>
  ),
  form: (
    <Stroke>
      <rect x="2.5" y="2.5" width="9" height="9" rx="1" />
      <line x1="4.5" y1="5.5" x2="9.5" y2="5.5" />
      <line x1="4.5" y1="8.5" x2="7.5" y2="8.5" />
    </Stroke>
  ),
  table: (
    <Stroke>
      <rect x="2.5" y="2.5" width="9" height="9" rx="1" />
      <line x1="2.5" y1="5.5" x2="11.5" y2="5.5" />
      <line x1="7" y1="2.5" x2="7" y2="11.5" />
    </Stroke>
  ),
};

/** Per-element-type icon: a component glyph, a heading badge (H1…H6), or a tag-category icon. */
function NodeIcon({ node }: { node: BridgeNode }): JSX.Element {
  if (node.component) {
    return (
      <Stroke>
        <path d="M7 1.8 12.2 7 7 12.2 1.8 7z" fill="currentColor" stroke="none" opacity="0.85" />
      </Stroke>
    );
  }
  if (/^h[1-6]$/.test(node.tag)) {
    return (
      <span className="flex h-3.5 w-4 flex-none items-center justify-center rounded-[2px] border border-vs-border-default font-mono text-[7px] font-bold uppercase leading-none text-vs-text-muted">
        {node.tag}
      </span>
    );
  }
  const group = TAG_GROUP[node.tag];
  if (group && GROUP_ICON[group]) return GROUP_ICON[group];
  // Fallback: a generic `<>` glyph for uncommon tags (the tag name is shown beside it).
  return (
    <Stroke>
      <path d="M5.5 4.5 3 7l2.5 2.5" />
      <path d="M8.5 4.5 11 7l-2.5 2.5" />
    </Stroke>
  );
}
