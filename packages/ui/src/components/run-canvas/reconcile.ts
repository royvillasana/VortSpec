import { parseAnchor, type CanvasEdit } from "@vortspec/core/canvas-edit";
import type { Projection, ProjectedNode } from "./node-tree";
import type { DeterministicEdit } from "./edit-plan";

/**
 * The diff reconciler (change: instatic-node-tree, DR-1 Stage 3.1). Given the LAST-PERSISTED
 * projection and the CURRENT (mutated) projection, compute the minimal set of source changes, each
 * located by STABLE node identity (id within a session; the write then re-locates by fingerprint).
 * This replaces "one field edit → one codemod" with "mutate the tree → diff → minimal codemods",
 * which naturally handles cascades (move one row, the rest reindex).
 *
 * Pure + framework-free so the whole reconciliation is unit-testable without the bridge.
 */
export type TreeChange =
  | { kind: "style"; prev: ProjectedNode; next: ProjectedNode; css: Record<string, string> }
  | { kind: "text"; prev: ProjectedNode; next: ProjectedNode }
  | { kind: "className"; prev: ProjectedNode; next: ProjectedNode }
  | { kind: "remove"; prev: ProjectedNode; parent: ProjectedNode | null; listIndex: number | null }
  | { kind: "insert"; next: ProjectedNode }
  | { kind: "reorderList"; next: ProjectedNode; from: number; to: number }
  | { kind: "move"; prev: ProjectedNode; next: ProjectedNode };

/** A repeated node's index among its SAME-fingerprint siblings (= the backing array index). */
function listIndexOf(p: Projection, node: ProjectedNode): number | null {
  if (!node.parentId) return null;
  const siblings = (p.byId.get(node.parentId)?.childIds ?? [])
    .map((id) => p.byId.get(id))
    .filter((n): n is ProjectedNode => !!n && n.fingerprint === node.fingerprint);
  if (siblings.length < 2) return null;
  const i = siblings.findIndex((n) => n.id === node.id);
  return i >= 0 ? i : null;
}

/** Indices of the LONGEST increasing subsequence of `seq` — the elements that DON'T need to move. */
function lisIndexSet(seq: number[]): Set<number> {
  const tails: number[] = []; // tails[k] = index in seq of the smallest tail of an increasing subseq of length k+1
  const prevOf: number[] = new Array(seq.length).fill(-1);
  for (let i = 0; i < seq.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]] < seq[i]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prevOf[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const keep = new Set<number>();
  let k = tails.length ? tails[tails.length - 1] : -1;
  while (k !== -1) {
    keep.add(k);
    k = prevOf[k];
  }
  return keep;
}

export function diffProjections(prev: Projection, next: Projection): TreeChange[] {
  const changes: TreeChange[] = [];
  const crossParentMoved = new Set<string>();

  for (const nextNode of next.byId.values()) {
    const prevNode = prev.byId.get(nextNode.id);
    if (!prevNode) {
      changes.push({ kind: "insert", next: nextNode });
      continue;
    }
    // Property mutations (identity unchanged).
    if (nextNode.className !== prevNode.className) changes.push({ kind: "className", prev: prevNode, next: nextNode });
    if (nextNode.text !== prevNode.text) changes.push({ kind: "text", prev: prevNode, next: nextNode });
    const css: Record<string, string> = {};
    for (const [k, v] of Object.entries(nextNode.style)) if (prevNode.style[k] !== v) css[k] = v;
    if (Object.keys(css).length > 0) changes.push({ kind: "style", prev: prevNode, next: nextNode, css });
    // Cross-parent relocation is always a move.
    if (nextNode.parentId !== prevNode.parentId) {
      changes.push({ kind: "move", prev: prevNode, next: nextNode });
      crossParentMoved.add(nextNode.id);
    }
  }

  // Same-parent REORDERS: per parent, only the MINIMAL set of items actually moved (LIS) — so a
  // removal/insertion that merely shifts siblings, or a single reorder, doesn't over-report.
  for (const nextParent of next.byId.values()) {
    if (!prev.byId.has(nextParent.id)) continue;
    const prevParent = prev.byId.get(nextParent.id)!;
    const common = new Set(
      nextParent.childIds.filter((id) => !crossParentMoved.has(id) && prev.byId.get(id)?.parentId === prevParent.id),
    );
    const prevSeq = prevParent.childIds.filter((id) => common.has(id));
    const nextSeq = nextParent.childIds.filter((id) => common.has(id));
    if (prevSeq.join(",") === nextSeq.join(",")) continue; // relative order unchanged (only compaction)
    const prevIndex = new Map(prevSeq.map((id, i) => [id, i]));
    const keep = lisIndexSet(nextSeq.map((id) => prevIndex.get(id)!));
    for (let i = 0; i < nextSeq.length; i++) {
      if (keep.has(i)) continue;
      const node = next.byId.get(nextSeq[i])!;
      const prevNode = prev.byId.get(nextSeq[i])!;
      const from = listIndexOf(prev, prevNode);
      const to = listIndexOf(next, node);
      if (node.dataDriven && from !== null && to !== null) changes.push({ kind: "reorderList", next: node, from, to });
      else changes.push({ kind: "move", prev: prevNode, next: node });
    }
  }

  for (const prevNode of prev.byId.values()) {
    if (next.byId.has(prevNode.id)) continue;
    const parent = prevNode.parentId ? (prev.byId.get(prevNode.parentId) ?? null) : null;
    changes.push({ kind: "remove", prev: prevNode, parent, listIndex: listIndexOf(prev, prevNode) });
  }
  return changes;
}

/**
 * Map tree changes to deterministic source edits. Property changes (style/text/className) and list
 * remove/reorder map cleanly, located by the PRE-change identity (so the write finds the element as
 * it is in source). `move`/`insert` still flow through the existing drag/insert handlers — they need
 * target anchors the projection alone doesn't pin — so they're returned as `unmapped` for the caller.
 */
export function treeChangesToEdits(changes: TreeChange[]): { edits: DeterministicEdit[]; unmapped: TreeChange[] } {
  const edits: DeterministicEdit[] = [];
  const unmapped: TreeChange[] = [];
  for (const c of changes) {
    // Location uses the PRE-change node (its className is what's in source now); insert uses next.
    const locNode = "prev" in c ? c.prev : c.next;
    const parsed = locNode.dataSource ? parseAnchor(locNode.dataSource) : null;
    if (!parsed) {
      unmapped.push(c);
      continue;
    }
    const { file, anchor } = parsed;
    const expect = { tag: locNode.tag || undefined, className: locNode.className || undefined };
    const det = (edit: CanvasEdit): void => void edits.push({ file, edit, expect });
    switch (c.kind) {
      case "style":
        det({ op: "style", anchor, css: c.css });
        break;
      case "text":
        det({ op: "text", anchor, text: c.next.text });
        break;
      case "className":
        det({ op: "attr", anchor, name: "className", value: { kind: "string", value: c.next.className } });
        break;
      case "remove":
        if (c.listIndex !== null) det({ op: "listRemove", anchor, index: c.listIndex });
        else det({ op: "delete", anchor });
        break;
      case "reorderList": {
        let to = c.to;
        if (c.from < to) to -= 1; // removing `from` shifts the target left
        det({ op: "listReorder", anchor, from: c.from, to });
        break;
      }
      default:
        unmapped.push(c); // move / insert → the existing drag/insert flow
    }
  }
  return { edits, unmapped };
}
