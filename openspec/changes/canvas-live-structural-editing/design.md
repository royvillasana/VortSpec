## Context

`canvas-compose-and-preview-bar` shipped the insert placeholder, the roster-grounded composition run, and the whole snapshot→run→preview→accept discipline (`useComposeRun.ts`, `compose-scaffold.ts`, `compose-apply.ts`, the bridge insert protocol in `inspector-bridge.ts`). Its geometry, though, is deliberately minimal. `resolveInsertTarget` (`insert-geometry.ts`) is handed **one** container as `{ computed, children: Rect[] }` and returns **one** `InsertTarget { anchorIndex, position, axis, line }`. The guest picks that container with a single `elementFromPoint` and one level of parent-walk (`guest.ts` `containerAndChildren`). There is no representation of nesting, no notion of "this row lives inside this section," and no drop-zone vocabulary. `inferFlowAxis` decides row-vs-column with no override, and `ComposePanel`'s only numeric control is the AI option count (1–3), not a layout quantity.

The three features requested — drag-move, insert-new-rows/columns, and axis/count choice — are each blocked on the same absent thing: a **structural model** of a subtree. Build it once as a pure, testable module; the guest produces its input by walking the live DOM (which it already does for the tree scan `buildTree`), and the drag/insert/axis features consume it.

The reuse surface is large and deliberate:
- **Overlay:** `InsertLine` and `PlaceholderBox` in `RunCanvas.tsx` already draw a line and a resizable box in scaled overlay coords.
- **Source-write discipline:** `useComposeRun.generate` snapshots via `api.snapshotTokenScope` *before* the run, spawns `useAgentRun.start` non-bare with `allowedTools: ["Read","Edit","Write"]`, parses a JSON result, previews via HMR, and accepts by stripping the scaffold (`acceptComposition` in `compose-apply.ts`). Discard/cancel restore the snapshot (`api.restoreFiles`).
- **Marker scaffold + commit guard:** `compose-scaffold.ts` defines the `VORTSPEC:COMPOSE` markers; `stripScaffold(keepOption)` accepts one option; `git-adapter.ts` refuses to commit a file carrying a marker; `sweepProjectScaffold` (`compose-apply.ts`) recovers crash-orphaned scaffolds on canvas open (`RunApp.tsx`).
- **Identity across HMR:** `uidOf`/`byId`/`fpToUid` and `resolveFingerprint`, plus `rebuildAndReacquire`/`reacquirePlaceholder` (`guest.ts`).

**Constraints (invariants).** Claude Code authors all source writes (1). Nothing commits without a recorded Accept (3). Runs stay non-bare, argument-array, in-project (7). Everything is plain files, state derivable from disk (6). `apps/desktop` stays out (no `webviewTag`). TypeScript strict.

## Goals / Non-Goals

**Goals:**
- One pure structural model, fed by a guest snapshot, that all three features share — no per-feature geometry forks.
- Drag a selected element into a *valid* layout slot, snapping to real drop zones, and relocate its JSX in source under the existing gated/snapshot/accept discipline.
- Create a new row/column container with N slots, previewed at true size, written by the run.
- Let the user override the inferred axis and pick a slot count, flowing that choice into placeholder geometry and the run prompt.
- Keep every failure mode honest: refuse an ambiguous drop, refuse to move into a generated file, refuse to write unsnapshotted, never leave a marker in committed source.

**Non-Goals:**
- **Cross-root / out-of-container moves.** Dragging an element to a position that belongs to no container (the page margin, between two top-level roots with no shared flex parent) is refused, not guessed.
- **Multi-select drag.** One element (and its subtree) at a time.
- **A Babel plugin or source maps.** Element→source stays heuristic (the compose precedent), and the run adjudicates or stops on ambiguity.
- **Free repositioning (absolute drag).** Drop snaps to structural slots only; this is layout-respecting move, not a design tool with x/y placement.
- **`apps/desktop` and Storybook (`play`).** As in the prior change.
- **Reordering across the whole tree in one drag** beyond what a single source cut+paste can honestly express — allowed only when origin and destination both resolve and are both snapshotted.

## Decisions

### 1. One pure structural model, fed by a serialized guest snapshot

Add `packages/core/src/shared/structure-model.ts`. Input: a `StructureSnapshot` — a flat array of container descriptors `{ id, fingerprint, rect, computed: {display, flex-direction, grid-auto-flow, gap}, childIds }` plus leaf rects, keyed like the existing `BridgeTree`. Output: a recursive `StructuralNode` tree with `kind: "section" | "row" | "column" | "leaf"`, per-node `axis`/`gap`, and a normalized `slots: Slot[]` (each a reuse of `InsertTarget`'s anchor+before/after normalization) plus `dropZones` for drag. It composes the existing pure primitives per container: `inferFlowAxis`, `visualRows`, `crossOverlap`, and the slop/midpoint logic already in `insert-geometry.ts`.

*Why pure + snapshot-fed:* the guest already walks the DOM for the tree (`buildTree`); adding computed-flow + child rects to that walk is cheap, and keeping the *reasoning* in a pure module means it is unit-testable with fixtures (the whole reason `insert-geometry` was extracted). The guest stays DOM plumbing; the model stays logic.

*Alternatives:* **compute structure entirely in the guest** — untestable without a live `<webview>`, and it forks geometry away from `insert-geometry`. **A full accessibility/role-based semantic model** — over-built; layout structure is a computed-style problem. Rejected.

*Cost, stated plainly:* nesting introduces genuine ambiguity the single-container model never had — a point in a gap can belong to the inner row *or* the outer section (Decision 4).

### 2. Drag-move reuses the compose scaffold with exactly one option

A move is written to source by a gated run that (a) removes the element's JSX from its origin and (b) re-inserts it at the destination slot **wrapped in a single `option=0` scaffold marker** from `compose-scaffold.ts`. Accept = `stripScaffold(runId, keepOption: 0)` via `acceptComposition`. Discard/cancel = `api.restoreFiles(snapshot)`. Commit stays blocked by the existing marker guard; `sweepProjectScaffold` still recovers a crash-orphan.

*Why:* the move needs exactly the guarantees the scaffold already provides — an HMR-rendered preview of the *real* relocated element, a commit that can't ship a half-done move, deterministic cleanup, crash recovery — and a move has no competing options, so it is a compose run with N=1. Reusing the marker means the git guard, the sweep, and the canvas-open recovery all cover moves for free, with zero new safety surface.

*Alternative:* mirror the token/variant structural-edit path (snapshot → run → reload → Keep/Revert) with **no marker**. Simpler, but it loses the commit guard and the crash-orphan sweep. Rejected: the scaffold's safety is the point.

*Cost:* moving JSX is strictly harder than inserting it. The run must *find and delete* the origin JSX (heuristic element→source, same as compose) **and** insert at the destination — two edit sites, possibly two files. This fails more often than insert; the failure modes (Decisions 4, 6) are the design.

### 3. Drag lives inside inspect mode, initiated on the selected element

No new canvas mode. In inspect mode, a `pointerdown` on the already-selected element followed by movement past a small threshold begins a drag (the guest owns the gesture, as it already owns pointer interception). During the drag the guest streams `dragTarget` events (drop slot under the pointer, computed from the structural model, **excluding the dragged subtree** from candidate children); `RunCanvas` draws the existing `InsertLine` plus a faint ghost of the dragged rect. `pointerup` emits `dragDrop { sourceFingerprint, target }`; the host opens the gated move run.

*Why not a fifth mode:* the user's model is "select this, then move it" — a continuation of inspect, not a separate tool. A fifth mode for an action that only makes sense *after* a selection would be noise (the prior change's Decision 3 made the same call).

*Alternative:* a dedicated "Move/Arrange" mode. Cleaner separation, but strands the natural select→drag loop behind a mode switch. Rejected.

### 4. Nested drop targets escalate to the user, then to the run — never a silent guess

When a point sits in a gap that belongs to both an inner row and its outer section, the guest offers the **innermost** valid slot by default (deepest container wins, matching `containerAndChildren`'s current "element that HAS children is the container" rule), but a modifier (hold to "pop out" one level) lets the user target the parent — surfaced visually by which container's slot the line spans. On drop, the chosen slot's anchor is resolved to source heuristically (reuse `compose.ts` resolution + the run's own adjudication); if the anchor matches multiple source locations the run **stops** with candidates (reuse the `stopped` result already in `composeResultSchema`), and if the drop belongs to no container it is refused before any run starts.

*Why:* this is the new ambiguity the structural model introduces, and the prior change already built the honest-failure vocabulary for exactly this shape (its Decision 5, the `stopped` outcome). We extend it rather than invent a second escalation path.

### 5. Axis and count are explicit inputs, and "option count" ≠ "slot count"

`ComposePanel` gains a **Row/Column segmented control** (pre-set to `bridge.placeholder.target.axis`, overridable) and a **slot-count stepper**. These flow into two places: the guest placeholder re-renders to the chosen axis and N sub-slots (extend `placeholderSizing`), and `buildComposePrompt` gains an explicit `insertSpec: { placement: "into-existing" | "new-row" | "new-column"; axis: "row" | "column"; slotCount: number }`.

*The naming trap, called out deliberately:* `buildComposePrompt` already has a `count` — the number of **AI options** (1–3, the variant discipline), clamped in `compose-run.ts`. The new quantity is **how many layout slots/rows/columns to create**, an unrelated number. They must not be conflated in code or UI. The new field is `insertSpec.slotCount`; `count` keeps its meaning.

*Why explicit override:* `inferFlowAxis` is right most of the time and wrong exactly when the user cares — a column band inside a row container is unreachable by inference. The prior change accepted inference as a v1 simplification; this removes that limitation without discarding the inference (it seeds the default).

### 6. Cross-file moves broaden the snapshot, or the run stops

`useComposeRun` snapshots `api.snapshotTokenScope` (token file + everything under `component_dir`) before a run. A move's origin or destination can be a **screen file outside `component_dir`**, which that snapshot would not cover — restoring on discard would then miss it. The move flow snapshots the token scope **plus** any file the host can resolve for source/target up front; and the move prompt instructs the run that if it must edit a file **not in the snapshot set** it must `stop` rather than write, so a discard can always restore exactly.

*Why:* invariant 3's safety net is only real if the snapshot covers every file the run touches. A move that edits an un-snapshotted file is un-revertable — the one thing the discard path must never allow.

*Alternative:* snapshot the entire project before every move. Correct but heavy on large repos; the run rarely needs more than two files. Rejected in favor of resolve-then-snapshot with a hard stop on scope escape. (If resolution is too weak to pre-identify files, fall back to a broader snapshot for moves only.)

### 7. Insert-new-container is a placement variant of the compose run, not a new run type

"Insert a new row/column with N slots" reuses the entire composition pipeline; only `insertSpec.placement` changes from `into-existing` to `new-row`/`new-column`. The prompt instructs the run to scaffold a **new flex container** (axis + N children) at the slot, each child either empty or filled per the user's intent, wrapped in the same option markers. The placeholder previews the N sub-slots.

*Why:* the write discipline, result contract, cleanup, and accept are identical; forking a second run flow would duplicate all of it. The only real new surface is prompt wording and multi-slot placeholder geometry.

### 8. Drag performance stays inside the existing rAF budget; HMR mid-drag pauses targeting

Drag targeting reuses the guest's existing single-flight rAF throttle — at most one `dragTarget` per frame. The structural model is recomputed lazily and cached per drag (rects only re-read on scroll/mutation), not per pointer event. If a `childList` mutation fires mid-drag (an HMR patch), the guest invalidates the cached snapshot and **suppresses drop targeting until the next stable frame**, rather than hit-testing against stale rects; if the dragged element's own fingerprint can't be re-acquired after the mutation, the drag is cancelled with a human sentence (mirroring `reacquirePlaceholder`'s "pick the spot again").

*Why:* the prior change's biggest real cost was HMR eating the placeholder; a drag is more sensitive because it holds transient state across many frames. Reusing the throttle and the fingerprint re-acquire keeps this a contained extension.

## Risks / Trade-offs

- **Moving JSX is harder than inserting it** → two edit sites, heuristic origin resolution, possibly two files. Mitigate with the `stopped` escalation on ambiguous origin/destination, the broadened snapshot (Decision 6), and a manual pass against a real dev server as the acceptance gate.
- **Nested/ambiguous structure gives more than one honest drop** → deepest-container default with an explicit pop-out modifier (Decision 4); on source ambiguity, the run stops with candidates.
- **Un-snapshotted file edited during a move → un-revertable discard** → resolve-then-snapshot, instruct the run to stop on snapshot-scope escape (Decision 6). Prove it with a test that discards a two-file move and asserts both files are byte-identical.
- **HMR mid-drag invalidates every rect** → invalidate the cached snapshot on `childList` mutation, suspend targeting, cancel the drag if the dragged fingerprint is lost (Decision 8).
- **Drag jank** → one `dragTarget` per rAF, cached structural model, ghost drawn in the (already-scaled) overlay, never re-scanning the DOM per pointermove.
- **Marker survives a crash mid-move** → same defense as compose: single-option scaffold, `sweepProjectScaffold` on canvas open, commit guard (Decision 2).
- **Axis/slot-count conflated with option-count** → distinct fields (`insertSpec.slotCount` vs `count`), Decision 5; enforce independently in `buildComposePrompt` and its tests.
- **The structural model drifts from `insert-geometry`** → the model *calls* `insert-geometry`'s primitives rather than reimplementing them; a shared fixture suite covers both.
- **Empty roster during drag/insert-container** → a move needs no roster (it relocates existing JSX); insert-new-container filled with components does; gate the filled path on `hasUsableRoster` as compose does, and allow an empty new container regardless.

## Migration Plan

1. Land `structure-model.ts` + the `requestStructure`/`structure` bridge messages + the guest structure scan. Pure and no-op to the UI; unit-testable and shippable behind nothing.
2. Axis/count override in `ComposePanel` + `buildComposePrompt.insertSpec` + placeholder geometry. Smallest user-visible slice.
3. Insert-new-row/column as an `insertSpec.placement` variant (Decision 7). Reuses (2)'s controls and the whole compose pipeline.
4. Drag-move last (Decisions 2, 3, 6, 8) — the largest, behind its own flag, because it is the only piece that writes a two-site source change.

Rollback: each milestone is independently revertable; drag-move sits behind a flag that falls back to today's inspect-mode-without-drag.

## Open Questions

- **Pop-out modifier key** (Decision 4) — which key, and whether a click-through breadcrumb of containers is friendlier than a held modifier. Decide during the manual pass.
- **Snapshot breadth for moves** (Decision 6) — resolve-then-snapshot vs a move-only whole-project snapshot; settle by measuring resolution reliability on a real project.
