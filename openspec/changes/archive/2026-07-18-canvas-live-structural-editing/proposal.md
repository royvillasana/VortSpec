## Why

The `canvas-compose-and-preview-bar` change taught the canvas to *add* one composition into one gap between two siblings. It did this on a deliberately thin geometric model: `resolveInsertTarget` in `packages/core/src/shared/insert-geometry.ts` sees exactly **one container and its direct children's rects** (`{ computed, children: Rect[] }`), and the guest hands it that container by a single `document.elementFromPoint` lookup (`guest.ts` `containerAndChildren`). That is enough to draw an insertion line, and nothing more. The canvas has no model of the page's *structure* — it cannot say "this is a section containing two rows, this row has three columns, here are the slots between them." Every richer interaction the user actually wants is blocked on that missing model:

- **You cannot move what already exists.** Inspect mode selects an element and edits its tokens/variant/text, or refactors it into a component. There is no way to grab a selected element (and its node subtree) and drag it into a different slot — the single most natural "live editing" gesture, and the thing every visual builder has. Today the only structural change is the token/variant modify run at `RunApp.tsx` (`applyEdits`), which rewrites an element in place; it never relocates one.
- **You cannot add structure, only fill a hole.** Insert always targets a gap *inside an existing flex/grid container*. There is no way to say "add a new row here" or "give me a three-column band" — to create a new container with N slots. The composition run (`buildComposePrompt` in `packages/core/src/shared/compose-run.ts`) assumes the slot already exists.
- **You cannot choose the axis.** `inferFlowAxis` (`insert-geometry.ts`) reads the container's computed style and decides row-vs-column for you. When the inference is wrong, or when the user wants a column band inside a row container, there is no override. The compose dialog (`ComposePanel.tsx`) exposes no axis control and no slot-count control — its only `count` is the number of AI *options* (1–3), which is a different quantity entirely.

All three are the same missing capability wearing three hats: **the canvas does not understand layout structure.** This change builds that understanding once, then spends it three times.

## What Changes

- **A structural model of a container/subtree.** A new pure module turns a serialized layout subtree (containers with their computed flow, gaps, and children's rects) into a tree of **sections → rows → columns → slots**, with the drop zones between and around children. It generalizes `insert-geometry`'s single-container hit-test into a nested, recursive model that the drag, insert-container, and axis-override features all consume. Pure and unit-testable; the guest feeds it a `structureSnapshot` over the existing bridge.
- **Live component drag-and-drop (respecting layout).** In inspect mode, a selected element can be **dragged**; the guest hit-tests valid slots (reusing the structural model, excluding the dragged subtree), draws the same insertion line the insert flow uses, and on drop runs a **gated Claude Code move** that relocates the element's JSX in source. The move is written under a single-option scaffold marker (reusing `compose-scaffold.ts`), previewed via HMR, and Kept/Reverted — the exact snapshot→run→accept discipline the composition run already follows.
- **Insert new rows/columns.** The insert flow gains a mode that creates a **new flex container** (row or column) with a chosen number of empty slots, rather than only filling one existing gap. The placeholder renders the N sub-slots at true size; the run scaffolds the new container.
- **Dynamic row/column choice in the compose area.** `ComposePanel` gains an explicit **Row/Column** segmented control (pre-set to the inferred axis, overridable) and a **slot-count** stepper. The choice flows into the placeholder geometry (guest re-sizes) and into the composition/insert-container prompt as an explicit instruction, replacing silent inference.

## Capabilities

### New Capabilities
- `canvas-structure-model`: the pure structural recognition of a container/subtree — sections/rows/columns/slots/drop-zones, axis and gap per container, and the serialized `structureSnapshot` the guest produces and the model consumes. The shared foundation the other three build on.
- `canvas-drag-move`: dragging a selected element (and its subtree) into a valid layout slot on the canvas, snapping to the structural model's drop zones, and committing the relocation through a gated, snapshot-guarded, marker-scaffolded, Keep/Revert-able source move.
- `canvas-insert-container`: creating a new row/column container with N slots from the insert flow — placeholder geometry, prompt, scaffold, accept/discard.

### Modified Capabilities
- `canvas-compose`: the composition run and `ComposePanel` gain an explicit axis override and a slot-count, replacing pure axis inference; `buildComposePrompt` and the placeholder geometry carry the choice. (Amends the requirement text that specifies inferred-only axis.)

## Impact

- **Depends on `canvas-compose-and-preview-bar`** landing first (it owns the insert placeholder, the scaffold/snapshot/accept machinery, the bridge insert protocol, and the compose panel this change extends).
- **`packages/core/src/shared/`:** a new `structure-model.ts` (pure); extensions to `insert-geometry.ts` (multi-slot / new-container sizing) and `compose-run.ts` (axis override, insert-spec, a `buildMovePrompt` + move result contract). All Vitest-covered.
- **`packages/core/src/shared/inspector-bridge.ts`:** new zod-typed messages — `requestStructure`/`structure`, drag lifecycle (`dragMove`/`dragTarget`/`dragDrop`), and an `insertSpec` on placeholder creation. Validated at the boundary (untrusted guest input).
- **`apps/ide/src/preload/guest.ts`:** a structure-scan walk; a drag hit-tester that excludes the dragged subtree; a multi-slot placeholder; drag-cursor affordances. Reuses `uidOf`/`byId`/`fpToUid`/`resolveFingerprint` and the existing rAF throttle and `rebuildAndReacquire`.
- **`packages/core/src/main/compose/compose-apply.ts` + `git-adapter.ts`:** the move run reuses `acceptComposition`/`sweepComposition`/`isCommittableSource`; a cross-file move may snapshot a broader scope than `snapshotTokenScope` covers.
- **`packages/ui`:** `RunCanvas` gains a drop-target overlay and a drag ghost; `ComposePanel` gains the axis/count controls and an insert-container sub-flow; `useComposeRun` / a new `useDragMove` drive the runs; `RunApp` owns the drag state.
- **Out of scope:** `apps/desktop` (no `webviewTag`, legacy `DevPreview.tsx`), the Storybook activity (key `play`), moving elements *across* the root out of any container, and multi-select drag (one element at a time).
- **Invariants upheld:** Claude Code performs every source write — the app never edits JSX itself (invariant 1); moves and new containers are written under a snapshot and require an explicit Accept (invariant 3); no new spawns, argument-array runs only, webview still loads the resolved localhost URL (invariant 7); the bridge stays preload-injected (invariant 6); TypeScript strict throughout.
- **Risks:** moving JSX in source is materially harder than inserting it (cut+paste across possibly two files vs one insertion); nested/ambiguous structure gives more than one honest drop target; drag must stay smooth under the rAF budget; HMR mid-drag invalidates every rect; and the true behavior of the move write, the drop hit-test, and the N-slot placeholder can only be verified against a live dev server.
