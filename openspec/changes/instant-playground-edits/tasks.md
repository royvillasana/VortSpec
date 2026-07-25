## 1. Source anchors + resolvability guard (the enabler)

- [x] 1.1 Stamp rendered elements with `data-source="file:line:col"` in dev (React JSX-source transform); confirm it never ships to the build output
- [ ] 1.2 Bridge: surface each selected/hovered node's `data-source` anchor alongside the existing node id
- [x] 1.3 `resolvability` check: given an anchor, statically decide direct-JSX-child vs. inside `.map()`/loop/conditional/HOC (AST-based), returning a confidence + reason
- [ ] 1.4 Fallback matcher: keep `resembleComponent` as the low-confidence path; unit-test anchor vs. matcher agreement

## 2. Deterministic AST codemods (no AI)

- [x] 2.1 Add `ts-morph` codemod module in core: `setJsxAttr`, `setClassName`, `setCvaVariant`, `setTextNode` (preserve imports/formatting)
- [x] 2.2 Structural codemods: `insertComponent` (JSX child at index + ensure import), `moveNode` (cut+insert), `duplicateNode`, `deleteNode`
- [x] 2.3 New IPC `canvas:writeEdit` (parallel to `inspector:setTokenValue`), each write captured under the existing snapshot mechanism
- [x] 2.4 Unit tests per codemod: prop/className/CVA/text + insert/move/duplicate/delete, incl. import handling and idempotency

## 3. The classification rule (the heart)

- [x] 3.1 Implement the `Router`: input-modality-first (`handler` → deterministic, `prompt` → AI), then the resolvability guard on the deterministic path
- [x] 3.2 Guarantee no handler starts an AI run as a side effect (assert in tests)
- [x] 3.3 Un-resolvable handler op → keep the optimistic overlay, withhold the write, offer an explicit "ask the assistant" hand-off (no auto-AI)
- [x] 3.4 Unit tests for every routing branch (handler-resolvable, handler-unresolvable, prompt) + the "never silent AI" invariant

## 4. Optimistic ledger + coalesced undo (pending.ts)

- [ ] 4.1 Extend `pending.ts` edit kinds to include the structural ops; add `coalesceKey` (`op:<nodeId>:<field>`) so bursts fold into one undo entry
- [ ] 4.2 Dirty set of `(file, nodeId)` so background writes ship only the delta
- [ ] 4.3 Undo/redo apply/reverse the codemod via snapshots, replacing Keep/Revert

## 5. Background persistence + per-island HMR

- [ ] 5.1 Auto-persist controller (modeled on Instatic `usePersistence`): dirty subscribe, ~400 ms debounce, take snapshot before write, single-flight + one queued follow-up
- [ ] 5.2 Remove the Apply/Keep/Save gate from `RunApp` manual edits; keep a passive "changes saved" indicator (open question in design)
- [ ] 5.3 Per-element HMR: on a landed write, hot-swap only the touched module; clear that node's overlay; do NOT bump the webview key / full reload
- [ ] 5.4 Failure handling: a failed write retains the optimistic edit and surfaces a fixable notice; HMR-unavailable falls back to one debounced reload, never per-edit

## 6. Verification

- [ ] 6.1 CT: a drag-move / resize applies instantly with no Apply/Keep/Save and no AI run (assert `__runPrompts` stays empty)
- [ ] 6.2 CT: insert from the picker, duplicate, delete on resolvable JSX write source deterministically; no AI
- [ ] 6.3 CT: an edit on an element inside a `.map()` keeps the visual change, withholds the write, offers the hand-off, and starts NO AI until accepted
- [ ] 6.4 CT: a language prompt still routes to the AI path
- [ ] 6.5 End-to-end on a sample React project: manual edits persist to the real source files; undo/redo round-trips; HMR updates only the edited component
- [ ] 6.6 Perf check: time-to-visible for a manual edit is bounded by the overlay (no AI/reload on the critical path)

## 7. Ship

- [ ] 7.1 Land behind the existing canvas flag through steps 1–4 (no behavior change), then flip 5 to enable optimistic persistence
- [ ] 7.2 Narrow the AI compose flow to language-expressed intent + the hand-off fallback; update run-canvas / canvas-compose docs
