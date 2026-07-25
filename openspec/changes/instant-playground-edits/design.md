## Context

Today a Playground manual edit is optimistic **visually** (the preview bridge overlays it live) but blocking to **persist**: `pending.ts` classifies edits, and on Apply, `RunApp.applyEdits()` routes `token` edits to a deterministic file rewrite (`inspector:setTokenValue`) but `style`/`variant`/text edits to a scoped Claude run, gated behind Apply/Keep/Save, and finished with a full preview reload. Instatic shows the target: a manipulation is a synchronous in-memory mutation that re-renders only that element; persistence is a debounced background autosave; and structural ops (insert/move/duplicate/delete) are pure tree operations, never AI. Instatic can do this because its page *is* a normalized node tree. VortSpec's source of truth is real component code, so we get the same feel by (a) writing bounded edits as AST codemods and (b) confining the AI to language-expressed intent.

## Goals / Non-Goals

**Goals**
- Instant, gate-less editing: no Apply/Keep/Save to see or retain a manual edit.
- Deterministic (no-AI) source writes for `insert`/`move`/`grab`/`duplicate`/`delete` + prop/style/variant/text.
- One classification rule, input-modality-first, with a static resolvability guard.
- Background, debounced, dirty-scoped persistence; per-element HMR instead of full reload.
- Keep real component files as the source of truth; keep edits reversible via snapshots.

**Non-Goals**
- A CMS-style node-tree-as-source-of-truth (Instatic's model). We do not introduce a second canonical page representation.
- Deterministic editing of dynamic JSX (`.map()`/conditional/HOC) — that stays an explicit assistant hand-off.
- Changing the AI compose flow for genuinely novel, language-expressed composition.
- Multi-file structural refactors driven by a single gesture (cross-file moves may still hand off to the assistant).

## Decisions

**D1 — The DOM→source anchor is the enabler.** In dev, stamp each rendered element with `data-source="file:line:col"` via React's JSX-source transform (`@babel/plugin-transform-react-jsx-source`, already implied by dev mode) so every DOM node the bridge sees has an exact AST anchor. Every deterministic write starts from this anchor. *Alternative:* infer the JSX by re-parsing + heuristic matching (today's `resembleComponent`) — kept as a fallback, but the stamp is authoritative and removes ambiguity. The stamp is dev-only and never ships (the published/build output is unaffected).

**D2 — Classification is input-modality-first, resolvability-second.** A `Router` takes `(source: "handler" | "prompt", op, anchor)`:
- `source === "prompt"` → AI path.
- `source === "handler"` → resolvability guard on `anchor`: a cheap static check (via the AST) that the node is a direct JSX child with a stable location, not inside a `.map()`/loop, ternary/`&&` conditional, or opaque HOC. Pass → deterministic codemod. Fail → optimistic overlay stays, write withheld, explicit "ask the assistant" offered. The AI never starts as a side effect of a handler.

**D3 — Deterministic writes are AST codemods, not string edits.** Use `ts-morph` (thin TS-AST layer over the compiler) in the main process to perform: set/replace a JSX attribute, edit a `className`/CVA variant, replace an inline text node, and the structural ops — `insertComponent` (insert JSX child at index + ensure import), `moveNode` (cut subtree, insert at target index), `duplicateNode` (clone subtree with a fresh key if needed), `deleteNode` (remove subtree). ts-morph preserves imports, formatting, and surrounding code. *Alternative:* Babel/recast — comparable; ts-morph chosen for first-class TS + simpler JSX navigation. Writes go through a new IPC (`canvas:writeEdit`) parallel to `inspector:setTokenValue`, each captured under the existing snapshot mechanism for undo.

**D4 — The optimistic overlay already exists; persistence moves off the critical path.** Keep the live bridge overlay for instant feedback. Replace `applyEdits()`-on-Apply with an auto-persist controller modeled on Instatic's `usePersistence`: subscribe to a dirty flag, debounce (~250–600 ms for local codemods, far tighter than Instatic's 30 s cloud save), take a dirty snapshot before the write, single-flight with one queued follow-up. The user keeps editing while a write is pending.

**D5 — Per-element HMR replaces the full reload.** After a background write, let the dev server's HMR hot-swap just the touched module; do not bump the webview key / force a reload. The overlay stands in until HMR lands, then is cleared for that node. If HMR can't scope to the module (rare), fall back to a single debounced reload — never per-edit.

**D6 — `pending.ts` becomes the optimistic ledger with coalesced undo.** Extend the edit kinds to include the structural ops; give each edit a `coalesceKey` (`op:<nodeId>:<field>`) so a typing/drag burst folds into one undo entry (Instatic's pattern); track a dirty set of `(file, nodeId)` so the background write ships only the delta. Undo/redo apply/reverse the codemod via the snapshot, replacing Keep/Revert.

## Risks / Trade-offs

- **A deterministic write against a stale/ambiguous anchor edits the wrong JSX** → the resolvability guard is a *correctness* gate, not just speed; when confidence is low, withhold the write and hand off. Prefer a missed deterministic write over a wrong one.
- **`data-source` stamps missing or stripped** (production build, certain transforms) → guard degrades to `resembleComponent` matching; if that's also low-confidence, hand off. Never write blind.
- **HMR resets local component state** on hot-swap → acceptable for design edits; where it matters, fall back to the overlay until a natural reload. Document per-framework HMR behavior (React Fast Refresh vs. Vue/Svelte).
- **Cross-file / dynamic structural ops** can't be deterministic → explicit assistant hand-off, clearly labeled, so the user understands *why* this one needs the AI.
- **Removing Apply/Keep changes muscle memory** → mitigated by undo/redo + a clear "saved" affordance; the snapshot trail preserves reversibility.

## Migration Plan

1. Land the anchor stamp + resolvability guard + `ts-morph` codemod module behind the existing canvas flag — no behavior change yet.
2. Route prop/style/variant/text edits through the deterministic writer (extend today's token path); keep Apply as a no-op safety net during rollout.
3. Add the structural handlers (insert/move/duplicate/delete) on the deterministic path.
4. Flip to auto-persist + per-element HMR; remove the Apply/Keep/Save gate; wire undo/redo.
5. Narrow the AI compose flow to language-expressed intent + the hand-off fallback.

Rollback: the deterministic writer is additive; disabling it reverts to today's Apply-gated AI reconcile without data loss (snapshots intact).

## Open Questions

- Debounce window per op class (structural vs. style) — start ~400 ms, tune from feel.
- Do we keep an explicit "Save" affordance as reassurance even though persistence is automatic (a passive "All changes saved" indicator), or remove it entirely?
- Framework coverage for the codemods + HMR: React first; Vue/Svelte/Angular need per-framework JSX/template writers — scope the first cut to the project's configured framework.
