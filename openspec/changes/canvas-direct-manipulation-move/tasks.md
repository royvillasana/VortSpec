## 1. Protocol + guest ephemeral reparent

- [ ] 1.1 `inspector-bridge.ts`: `revertMove` + `clearMove` commands. zod round-trip test.
- [ ] 1.2 Guest (`guest.ts`): on a valid drop, reparent the dragged element into the target slot immediately, remembering origin (parent + next-sibling fingerprints) and the target (anchor fingerprint + position). `dragDrop` fires as before (the DOM is already moved). `revertMove` re-inserts at origin; `clearMove` forgets the tracked move. Re-apply the reparent in `rebuildAndReacquire` so an app re-render can't undo it.

## 2. Hook + panel flow

- [ ] 2.1 `useDragMove`: phases `idle | moved | reconciling | error`. `onDrop(source, target)` → `moved` (no AI). `keep()` → snapshot source scope, run the move prompt, auto-accept on success, reload, owe the screen update. `revert()` → `bridge.revertMove()`, reset. A stopped/failed keep → `error`, element stays moved pending revert.
- [ ] 2.2 `MovePanel`: `moved` shows "Moved here — Keep / Revert"; `reconciling` shows the spinner + Stop; error/screen-update unchanged.
- [ ] 2.3 `RunApp`: a valid `dragDrop` calls `move.onDrop` (instant), not an immediate run.

## 3. Tests & verification

- [ ] 3.1 CT (`drag-move.ct.tsx`): a drop lands in `moved` with no run started; Keep runs the move + auto-accepts (keepOption 0) + owes a screen update; Revert calls `revertMove` and starts no run; a stopped keep shows the sentence with the element still moved.
- [ ] 3.2 Green: `pnpm check-types`, core vitest, Playwright CT (ide + desktop), `openspec validate --all`.
