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

/** A Figma-layers-style label: component name (if any) else tag, with a class hint. */
function NodeLabel({ node }: { node: BridgeNode }): JSX.Element {
  const name = node.component ?? node.tag;
  const hint = node.idAttr ? `#${node.idAttr}` : node.classes[0] ? `.${node.classes[0]}` : "";
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate font-medium">{name}</span>
      {hint && <span className="truncate text-[10px] text-vs-text-muted">{hint}</span>}
    </span>
  );
}
