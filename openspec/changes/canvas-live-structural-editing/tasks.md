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

- [ ] 3.1 Add `insertSpec: { placement: "into-existing"|"new-row"|"new-column"; axis: "row"|"column"; slotCount: number }` to `ComposePromptInput` (`compose-run.ts`). Keep `count` (AI options, 1–3) untouched and distinct — a code comment making the distinction explicit.
- [ ] 3.2 Thread `insertSpec` into the prompt body: state the chosen axis explicitly ("insert as a {row|column}"), overriding inference; unit-test the axis wording and that `count` vs `slotCount` are independent.
- [ ] 3.3 `ComposePanel.tsx`: a Row/Column segmented control pre-set to the slot axis and overridable, plus a slot-count stepper. Wire both into `compose.generate`.
- [ ] 3.4 Placeholder geometry: extend `placeholderSizing(axis)` (`insert-geometry.ts`) to render the chosen axis, and add a variant laying out N sub-slots for a count > 1. Guest re-materializes the placeholder on axis/count change (extend `createPlaceholder` payload with `insertSpec`; `resizePlaceholder` unchanged).
- [ ] 3.5 `useComposeRun.generate` passes `insertSpec` (axis from the control, `slotCount` from the stepper) into `buildComposePrompt`. Snapshot/accept/discard paths unchanged.
- [ ] 3.6 CT (`compose.ct.tsx`): axis toggle changes the generated prompt's axis line; slot-count changes `slotCount` (and never the option `count`); placeholder reflects the chosen axis via the mock bridge.

## 4. Insert new rows/columns (canvas-insert-container)

- [ ] 4.1 Prompt: extend `buildComposePrompt` for `placement: "new-row"|"new-column"` — instruct the run to scaffold a NEW flex container (chosen axis, `slotCount` children), each child empty or filled per intent, wrapped in the existing option markers. Unit-test the new-container wording and that empty children are allowed without a roster.
- [ ] 4.2 `ComposePanel`: a placement selector (Into gap · New row · New column) that switches the sub-flow; when a new empty container is requested, allow generate with no roster (bypass the `hasUsableRoster` gate for the empty case only).
- [ ] 4.3 Multi-slot placeholder in the guest (from 3.4): render the N sub-slots at true size so the user sees the band before filling it.
- [ ] 4.4 Accept/discard/commit-guard: reuse `acceptComposition`/`sweepComposition`/marker guard unchanged (a new container is just option-0 scaffold). Unit test that a new-container scaffold accepts to marker-free source.
- [ ] 4.5 CT: new-row placement produces a container-scaffolding prompt; empty new container generates without a roster; accept records `keepOption` 0.

## 5. Live component drag-and-drop (canvas-drag-move) — largest, flagged

- [ ] 5.1 Protocol (`inspector-bridge.ts`): `dragMove`/`dragTarget`/`dragDrop` events (drop `Slot` under the pointer, and the final `{ sourceFingerprint, target, poppedOut }`) and a drag-cursor hint. zod round-trip tests.
- [ ] 5.2 Guest drag gesture (`guest.ts`): in inspect mode, `pointerdown` on the selected element + movement past a threshold begins a drag; stream `dragTarget` via `slotAt(model, point, { excludeSubtree })` behind the existing rAF; `pointerup` emits `dragDrop`. Cancel on Escape.
- [ ] 5.3 Guest HMR-during-drag safety (Decision 8): on a `childList` mutation mid-drag, invalidate the cached structural snapshot and suspend targeting until the next stable frame; if the dragged fingerprint can't be re-acquired, cancel the drag with a human sentence.
- [ ] 5.4 Overlay (`RunCanvas.tsx`): reuse `InsertLine` for the drop slot; draw a faint ghost of the dragged rect; pop-out modifier surfaces the parent container's slot. No new box component if `InsertLine` suffices.
- [ ] 5.5 `buildMovePrompt` (`compose-run.ts` or a sibling module): instruct the run to CUT the element's JSX from its origin (heuristic resolution + the anchor's leading text, reusing the compose disambiguation) and RE-INSERT it at the destination slot wrapped in a single `option=0` marker; STOP (reuse `stopped`) on ambiguous origin/destination, on a drop belonging to no container, or if it must edit a file outside the snapshot set. Unit-test the prompt + reuse `composeResultSchema` for the result.
- [ ] 5.6 `useDragMove` hook (mirror `useComposeRun`): resolve source/target files up front, snapshot the token scope PLUS those files (Decision 6), run non-bare with `allowedTools: ["Read","Edit","Write"]` / `bypassPermissions` / `strictMcp` / sonnet, parse, preview the moved element via HMR, Accept (`acceptComposition` keepOption 0) or Discard/Cancel (`restoreFiles`). One move in flight per workspace.
- [ ] 5.7 Host pre-check: reuse `composeCheckTarget`/`isCommittableSource` on BOTH resolved files before offering Accept; refuse a move into a generated/ignored file with a human sentence.
- [ ] 5.8 `RunApp.tsx`: own the drag state, mount the move panel (a thin `ComposePanel` variant or a dedicated `MovePanel`), route Accept/Discard through `useDragMove`. Behind a feature flag falling back to inspect-without-drag.
- [ ] 5.9 Screen-Creation-update notice (reuse §6.15 pattern): a relocation is a screen-composition change — after Accept, inform (don't block) that the screen's spec owes an update, offering to run it via `dispatchAssistantTask`.
- [ ] 5.10 CT (`drag-move.ct.tsx`, mock bridge): a drag emits `dragTarget`; a drop opens the gated move (prompt carries the source fingerprint + marker); accept records `keepOption` 0; discard restores the snapshot; an ambiguous/no-container drop surfaces the `stopped` sentence with Discard only; a two-file move's discard restores both.

## 6. Tests & verification

- [ ] 6.1 Vitest: `structure-model.test.ts` (nesting, wrap, grid, subtree exclusion, ambiguity), `compose-run.test.ts` additions (insertSpec axis/placement/slotCount, `slotCount` ≠ `count`, new-container wording, move prompt + stop clauses), `insert-geometry.test.ts` additions (chosen-axis + N-slot placeholder sizing).
- [ ] 6.2 Vitest: `compose-apply.test.ts` additions — a two-file move discard restores both files byte-identical (real temp repo); a move scaffold accepts to marker-free source; the commit guard still refuses a marker-bearing move file.
- [ ] 6.3 CT (mock bridge): §3.6, §4.5, §5.10 green in `apps/ide`.
- [ ] 6.4 Green: `pnpm build && pnpm test && pnpm lint && pnpm check-types`, Playwright CT (ide + desktop), `openspec validate --all`.
- [ ] 6.5 Manual end-to-end against a real dev server (the acceptance gate — only these are verifiable live):
  - Structure: hover nested rows/sections and confirm the model resolves the right slot and pops out one level correctly.
  - Axis/count: override a row→column, set a slot count, confirm the placeholder and the inserted composition match.
  - Insert container: create a 3-column band, confirm it hot-reloads and source contains exactly the new container and no markers.
  - Drag-move: drag a card from one row to another within one file and across two files; confirm the JSX relocated, no markers remain on accept, discard leaves both files byte-identical; confirm an ambiguous drop stops with candidates; confirm an HMR patch mid-drag cancels cleanly rather than dropping onto a stale rect.
