## 1. Prerequisite

- [ ] 1.1 Confirm `canvas-compose-and-preview-bar` is landed (its §5–6 machinery — placeholder, scaffold, snapshot/accept, insert protocol — is the base this builds on). If its manual pass (its 7.6) is still open, note it; this change depends on the code, not that verification.

## 2. Structure recognition — the shared foundation (canvas-structure-model)

- [x] 2.1 `packages/core/src/shared/structure-model.ts`: `NodeDesc` + `StructureSnapshot` (flat descriptors: id, fingerprint, rect, computed, childIds) and `StructuralNode` (`kind: section|row|column|leaf`, axis, gap, children, `slots: Slot[]`). `Slot` reuses `InsertTarget`'s normalization (anchor + before/after + line).
- [x] 2.2 `buildStructuralModel(snapshot)` recursively builds the tree; per container it composes the existing primitives (`inferFlowAxis`, and a new exported `enumerateInsertTargets` that reuses `visualRows`/cross-overlap/line math from `insert-geometry.ts` — not reimplemented). `classify` labels section vs row/column vs leaf.
- [x] 2.3 `slotAt(model, point, { excludeSubtree, popOut })` resolves the slot deepest-container-first (skips a container whose only child is the dragged element, popping to its parent), excludes the dragged subtree, reuses `resolveInsertTarget`. Plus `containerDepthAt` (pop-out affordance) and `dropZonesFor` (all slots, minus a dragged subtree).
- [x] 2.4 `structure-model.test.ts` (9 tests): nested section→rows→columns, slot enumeration, deepest-vs-pop-out resolution, subtree exclusion (can't drop into self / sole-child container pops up), no-container → null, depth, drop-zone enumeration. Pure fixtures. `insert-geometry.test.ts` unchanged/green.
- [x] 2.5 Protocol (`inspector-bridge.ts`): `structureNodeSchema`/`structureSnapshotSchema`, a `requestStructure` command (nullable nodeId) and a `structure` event, zod-validated. Round-trip test added (incl. leaf-default application).
- [x] 2.6 Guest (`guest.ts`): `buildStructureSnapshot(rootEl)` walks the subtree collecting rect + layout-computed (display/flex-direction/grid-auto-flow/gap) + child ids (reusing `childElementsOf` to skip chrome, `fingerprintFor` for durable anchors, tree uids where present); emits on `requestStructure` (scoped by nodeId or the body).
- [x] 2.7 Renderer (`useInspectorBridge.ts`): `structure` state + `requestStructure(nodeId?)` command + the `structure` event handler; `StructureSnapshotWire` exported from the ipc barrel; mock bridge updated. No UI yet — verified by typecheck + the protocol round-trip; the live scan is a §6.5 item.

## 3. Dynamic row/column choice in compose (canvas-compose, modified)

- [x] 3.1 `InsertSpec { placement: "into-existing"|"new-row"|"new-column"; axis: "row"|"column"; slotCount }` added to `ComposePromptInput` (`compose-run.ts`), with a comment making `slotCount` (layout) explicitly distinct from `count` (AI options, 1–3).
- [x] 3.2 `buildComposePrompt` uses `insertSpec.axis` to override the inferred flow wording and emits an explicit placement line ("Insert as a {axis}", or "Create a NEW {row|column} container with N slots"). Unit-tested: axis override, `slotCount` ≠ `count`, new-container wording.
- [x] 3.3 `ComposePanel` gained a Row/Column segmented control (pre-set to the inferred `defaultAxis`, overridable) and a slot-count stepper (1–6); both flow into `compose.generate(draft, preferred, spec)`.
- [x] 3.4 Guest: `fillPlaceholder(el, axis, slotCount)` re-renders the placeholder to the chosen axis and N sub-slot cells; `placeholderSizing` covers the axis. New `setPlaceholderSpec` command re-renders the live placeholder and re-emits its rect; `RunApp` wires the panel's `onInsertSpecChange` to it. (Visual is a §6.5 live item.)
- [x] 3.5 `useComposeRun.generate(prompt, preferred?, insertSpec?)` threads `insertSpec` into `buildComposePrompt`; snapshot/accept/discard unchanged.
- [x] 3.6 CT: toggling to Column + bumping slots to 3 makes the run prompt carry "vertical (column) flow" / "Insert as a column" / "Create 3 items" while the option count stays "at most 3 options".

## 4. Insert new rows/columns (canvas-insert-container)

- [x] 4.1 `buildComposePrompt` emits the new-container instruction for `new-row`/`new-column` (a NEW flex container, chosen axis, `slotCount` children), and now tolerates an empty roster (says "create empty placeholder slots"). Unit-tested (new-container wording; empty-roster prompt).
- [x] 4.2 `ComposePanel` gained a Placement selector (Into gap · New row · New column); the axis toggle shows only for "into gap" (a new row/column fixes the axis). The empty-roster message now blocks only "into gap" — a new container generates with no roster and no intent. `useComposeRun.generate` bypasses the roster+intent gate when `placement !== "into-existing"`.
- [x] 4.3 Multi-slot placeholder done in §3.4 (`fillPlaceholder` renders N sub-slot cells along the axis); driven here by the placement selector via `setPlaceholderSpec`.
- [x] 4.4 Accept/discard/commit-guard reuse the compose machinery unchanged. Unit test added: a new-container scaffold (a flex `<div>` with cards) accepts to marker-free source.
- [x] 4.5 CT: with an empty roster, "into gap" shows the empty-roster message; switching to "New row" clears it and Generate runs without an intent, and the run prompt carries "Create a NEW row container". Options surface (accept path is the shared one, already covered).
- [x] 4.6 Stepped, Figma-like layout picker: `ComposePanel` is a two-step flow — step 1 (`compose-layout`) picks placement (Into gap / Columns / Rows) + a visual `SlotStrip` count / axis toggle; step 2 shows the chosen layout as an editable summary label, then the tabs + prompt. Placement relabelled to the user's mental model (Columns = flex-row, Rows = flex-column). Discard/cancel/error return to step 1. CT: layout controls set axis+count on the strip; discard returns to the layout step.
- [x] 4.7 Deferred screen-spec update: the accepted-insert "Later" button hands the owed Screen Creation update to a persistent "Save changes" bar at the bottom of the Design sidebar (`screen-update-bar`, reusing the inspect Apply-bar style) instead of dropping it; Save runs the update per screen, dismiss drops one. CT covers Later → sidebar bar → Save.

## 5. Live component drag-and-drop (canvas-drag-move) — largest, flagged

- [x] 5.1 Protocol (`inspector-bridge.ts`): `dragStart`/`dragTarget`/`dragDrop`/`dragCancel` events + a `cancelDrag` command. The per-frame ghost + drop slot + pop-out state are merged into ONE `dragTarget` (drop `Slot` under the pointer, null = no-drop cursor hint), and `dragDrop` carries the final `{ sourceFingerprint, target, poppedOut }`. zod round-trip tests.
- [x] 5.2 Guest drag gesture (`guest.ts`): in inspect mode, `pointerdown` on the selected element + movement past a 4px threshold begins a drag; streams `dragTarget` via `slotAt(model, point, { excludeSubtree, popOut })` behind the existing rAF; `pointerup` emits `dragDrop`. Cancel on Escape / leaving inspect mode / host `cancelDrag`.
- [x] 5.3 Guest HMR-during-drag safety (Decision 8): the mid-drag rebuild path re-locks the dragged element by fingerprint and rebuilds the cached model against the fresh DOM; if the fingerprint can't be re-acquired, the drag cancels with a human sentence (`dragCancel { message }`).
- [x] 5.4 Overlay (`RunCanvas.tsx`): reuse `InsertLine` for the drop slot; draw a faint `DragGhost` of the dragged rect; pop-out (Alt) surfaces the parent container's slot via the guest's `popOut`.
- [x] 5.5 `buildMovePrompt` (`compose-run.ts`): CUT the element's JSX from its origin (label + leading text, reusing the compose disambiguation) and RE-INSERT it at the destination wrapped in a single `option=0` marker; STOP (reuse `stopped`) on ambiguous/missing origin/destination, a drop belonging to no container, a generated/ignored file, or an edit outside the snapshot set. Unit-tested; result reuses `composeResultSchema`.
- [x] 5.6 `useDragMove` hook (mirror `useComposeRun`): snapshot the token scope before any write and pass its file list as the allowed set (Decision 6 — no fingerprint→file resolver, so the run stops on any scope escape), run non-bare (Read/Edit/Write, bypassPermissions, strictMcp, sonnet), parse, preview the moved element via HMR, Accept (`composeAccept` keepOption 0) or Discard/Cancel (`restoreFiles`). One move in flight per workspace.
- [x] 5.7 Host pre-check: reuse `composeCheckTarget` on the destination the moment the run reports it before offering Accept; refuse a generated/ignored file with a human sentence (the origin is guarded by the prompt's stop clause).
- [x] 5.8 `RunApp.tsx`: own the drag state, mount a dedicated `MovePanel`, route Accept/Discard through `useDragMove`. Behind a `dragMoveEnabled` flag falling back to inspect-without-drag.
- [x] 5.9 Screen-Creation-update notice (reuse §4.7 pattern): after Accept, inform (don't block) that the screen's spec owes an update — "Update the screen spec" or "Later" (hands it to the sidebar Save-changes bar).
- [x] 5.10 CT (`drag-move.ct.tsx`, mock bridge): a drop opens the gated move (prompt carries the source label + a single marker); accept records `keepOption` 0 + owes a screen update; a two-file discard restores both snapshotted files; an ambiguous drop surfaces the `stopped` sentence with Discard only; a generated/ignored destination is refused.

## 6. Tests & verification

- [x] 6.1 Vitest: `structure-model.test.ts` (§2, done), `compose-run.test.ts` additions (insertSpec axis/placement/slotCount, `slotCount` ≠ `count`, new-container wording — done in §3/§4; move prompt + stop clauses — done in §5), `insert-geometry.test.ts` (chosen-axis + N-slot placeholder sizing — done in §3).
- [x] 6.2 Vitest: `compose-apply.test.ts` additions — a two-file move discard restores both files byte-identical (real temp repo); a single-option move scaffold accepts to marker-free source. (The commit guard refusing a marker-bearing file is the identical guard already covered for compose — a move file carries the same markers.)
- [x] 6.3 CT (mock bridge): §3.6, §4.5, §5.10 green in `apps/ide`.
- [x] 6.4 Green: `pnpm check-types` (core/ui/ide/desktop), `pnpm test` (core 506), `pnpm lint`, Playwright CT (ide 122 + desktop 100), `openspec validate --all` (63/63).
- [ ] 6.5 Manual end-to-end against a real dev server (the acceptance gate — only these are verifiable live):
  - Structure: hover nested rows/sections and confirm the model resolves the right slot and pops out one level correctly.
  - Axis/count: override a row→column, set a slot count, confirm the placeholder and the inserted composition match.
  - Insert container: create a 3-column band, confirm it hot-reloads and source contains exactly the new container and no markers.
  - Drag-move: drag a card from one row to another within one file and across two files; confirm the JSX relocated, no markers remain on accept, discard leaves both files byte-identical; confirm an ambiguous drop stops with candidates; confirm an HMR patch mid-drag cancels cleanly rather than dropping onto a stale rect.
