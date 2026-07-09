import { memo, useState } from "react";
import type { JSX } from "react";
import type { BridgeTree, BridgeNode } from "@vortspec/core/ipc";

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
  hoveredId,
  onSelect,
  onHover,
}: {
  tree: BridgeTree | null;
  selectedId: string | null;
  hoveredId?: string | null;
  onSelect: (id: string) => void;
  onHover?: (id: string | null) => void;
}): JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  function renderNode(id: string, depth: number): JSX.Element[] {
    const node = tree!.nodes[id];
    if (!node) return [];
    const kids = tree!.children[id] ?? [];
    const hasKids = kids.length > 0 || node.childCount > 0;
    const isOpen = expanded.has(id);
    const row = (
      <button
        key={id}
        type="button"
        onClick={() => onSelect(id)}
        onMouseEnter={() => onHover?.(id)}
        onMouseLeave={() => onHover?.(null)}
        style={{ paddingLeft: 6 + depth * 12 }}
        className={`flex w-full items-center gap-1 py-[3px] pr-2 text-left text-[12px] ${
          selectedId === id
            ? "bg-vs-accent-subtle text-vs-text-primary"
            : hoveredId === id
              ? "bg-vs-bg-hover text-vs-text-primary"
              : "text-vs-text-secondary hover:bg-vs-bg-hover"
        }`}
      >
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
