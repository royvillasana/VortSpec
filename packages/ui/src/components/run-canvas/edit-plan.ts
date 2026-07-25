import type { Selection } from "@vortspec/core/ipc";
import { parseAnchor, type CanvasEdit } from "@vortspec/core/canvas-edit";
import { isTokenBinding, type PendingEdit } from "./pending";

/**
 * The deterministic side of the instant-edit loop (change: instant-playground-edits, Group 4).
 *
 * Turns a manual `PendingEdit` (+ the selection's `data-source` anchor) into a `CanvasEdit`
 * the codemods can write to source with no AI — for the edit kinds that map cleanly:
 *   • variant  → a className swap                    (setJsxAttr className)
 *   • text     → the element's inline text           (setTextNode)
 *   • delete   → remove the element                  (deleteNode)
 * Everything else (freeform style→class inference, token-value rewrites) returns null and stays
 * on its existing path. Pure + framework-free so it's fully unit-testable.
 */

/** Apply a variant class swap to a className string (remove then add, de-duped, order-stable). */
export function applyClassSwap(className: string, remove: string[] = [], add: string[] = []): string {
  const removeSet = new Set(remove);
  const kept = className.split(/\s+/).filter((c) => c && !removeSet.has(c));
  const seen = new Set(kept);
  for (const c of add) {
    if (c && !seen.has(c)) {
      kept.push(c);
      seen.add(c);
    }
  }
  return kept.join(" ");
}

/**
 * The coalesce key for an edit — a burst of edits sharing this key folds into ONE undo entry
 * (e.g. typing into a text field, or dragging a handle). `<kind>:<nodeId>:<field>`.
 */
export function coalesceKey(edit: PendingEdit): string {
  const node = edit.nodeId ?? edit.fingerprint ?? edit.elementLabel ?? "•";
  return `${edit.kind}:${node}:${edit.key}`;
}

/**
 * Map a pending edit to a deterministic source write, using the selection's `data-source`
 * anchor. Returns null when the edit can't be written deterministically (no anchor, or a kind
 * that needs class inference / the token file) — the caller then keeps it on the AI/other path.
 */
export function toCanvasEdit(edit: PendingEdit, selection: Selection): { file: string; edit: CanvasEdit } | null {
  const parsed = parseAnchor(selection.dataSource);
  if (!parsed) return null;
  const { file, anchor } = parsed;

  // A whole-element deletion.
  if (edit.remove) {
    return { file, edit: { op: "delete", anchor } };
  }

  // A variant change is a className swap — deterministic when we know the current classes.
  if (edit.kind === "variant" && (edit.addClasses?.length || edit.removeClasses?.length)) {
    if (edit.elementClassName === undefined) return null;
    const next = applyClassSwap(edit.elementClassName, edit.removeClasses, edit.addClasses);
    return { file, edit: { op: "attr", anchor, name: "className", value: { kind: "string", value: next } } };
  }

  // An inline-text edit.
  if (edit.key === "content") {
    return { file, edit: { op: "text", anchor, text: edit.value } };
  }

  // token-value rewrites (token file) and freeform style→class inference stay on their own paths.
  return null;
}

/**
 * Split a batch of built edits into the three instant/gated lanes `RunApp.commitEdits` applies,
 * extracted so the decision is unit-testable without the webview bridge:
 *   • deterministic — variant/text/delete on a stamped element → background `writeCanvasEdit`, no AI
 *   • tokenValues   — a token's VALUE change → background `setTokenValue`, no AI (also instant)
 *   • ledger        — everything else (freeform style, token BINDINGS) → the gated pending/Apply path
 *
 * A token BINDING (`var(--x)`) is a per-element source edit, NOT a value rewrite, so it stays in the
 * ledger (writing its value would produce `--x: var(--x)`).
 */
export function routeEdits(
  edits: PendingEdit[],
  selection: Selection,
): {
  deterministic: { file: string; edit: CanvasEdit }[];
  tokenValues: { token: string; value: string }[];
  ledger: PendingEdit[];
} {
  const deterministic: { file: string; edit: CanvasEdit }[] = [];
  const tokenValues: { token: string; value: string }[] = [];
  const ledger: PendingEdit[] = [];
  for (const e of edits) {
    if (e.kind === "token" && e.token && !isTokenBinding(e)) {
      tokenValues.push({ token: e.token, value: e.value });
      continue;
    }
    const det = toCanvasEdit(e, selection);
    if (det) deterministic.push(det);
    else ledger.push(e);
  }
  return { deterministic, tokenValues, ledger };
}

/**
 * The dirty set — which (file, node) pairs have un-persisted deterministic edits, so a
 * background write ships only the delta. Keyed by `<file>::<node>`.
 */
export class DirtySet {
  private set = new Set<string>();
  private keyOf(file: string, node: string): string {
    return `${file}::${node}`;
  }
  mark(file: string, node: string): void {
    this.set.add(this.keyOf(file, node));
  }
  clear(file: string, node: string): void {
    this.set.delete(this.keyOf(file, node));
  }
  drain(): { file: string; node: string }[] {
    const out = [...this.set].map((k) => {
      const i = k.lastIndexOf("::");
      return { file: k.slice(0, i), node: k.slice(i + 2) };
    });
    this.set.clear();
    return out;
  }
  get size(): number {
    return this.set.size;
  }
}
