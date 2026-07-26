## 1. Projected node tree (read-only first — no behavior change)

- [x] 1.1 Define the `ProjectedNode` model: stable `id` (fingerprint), parent/children, `props`, `text`, `dataSource`, `dataDriven` (pure `buildProjection` + identity lookup + DFS walk; 7 tests)
- [x] 1.2 Build the projection from the inspector bridge's structure snapshot + readouts; keep it in sync on bridge updates
- [x] 1.3 Mark `dataDriven` subtrees (rendered inside `.map`/conditional over non-local data) from the resolvability analysis
- [x] 1.4 Dev-only assertion: the projected tree matches the live DOM (same nodes, order, identities) — prove parity before routing anything through it

## 2. Route reads through the tree

- [x] 2.1 Layers panel reads from the projection (self-healing: projection when it matches bridge.tree, else fall back) (not ad-hoc DOM walks)
- [x] 2.2 Persist queue coalesced by node identity + op + field (last-write-wins; a slider drag → one write) `id` (not `(file, nodeId)` positional)

## 3. Identity-located reconciliation (retire positional writes)

- [ ] 3.1 Reconciler: diff the tree vs. last-persisted tree → minimal codemod set
- [x] 3.2 Locate each target JSX by identity (DELIVERED by DR-2: writes carry the element identity and re-locate via matchBySignature; data-source is the hint) (`matchBySignature`), `data-source` only as a tiebreaker; line:col never drives a write
- [x] 3.3 Reuse the existing codemods as emit targets (the write path already emits through them, identity-located) (no new codemods); route set-prop/text/move/insert/remove/reorder through the reconciler
- [ ] 3.4 Retire the positional write path + its mitigations (RT-3 descending-line ordering, DR-2 anchor re-location) once parity holds
- [x] 3.5 Data-driven structural mutations hand off explicitly (REALIZED: same-list reorder/delete → local-array codemods; external-data → auto-reconcile; non-editable target → clean refuse, no dead-end AI) (local array edit, else assistant) from the `dataDriven` flag — no dead-end AI run

## 4. Per-node islands (optimization)

- [ ] 4.1 Apply a single-node change via the live overlay in place; skip the module reload where the overlay expresses it fully
- [ ] 4.2 Fall back to HMR only for changes the overlay can't express

## 5. UX: surface the determinism boundary

- [ ] 5.1 Mark data-driven nodes in the Layers/canvas so the user sees WHY a node isn't directly editable, before acting

## 6. Verification

- [ ] 6.1 The full instant-canvas-edits CT suite passes unchanged at each stage (regression gate)
- [ ] 6.2 New CTs: a tree mutation reconciles to the right source node by identity even when line:col is stale
- [ ] 6.3 A burst of edits (incl. a structural op) reconciles correctly with NO descending-line ordering needed (identity-located)
- [ ] 6.4 End-to-end on a real project: manipulate → tree updates instantly → source reconciles → survives a restart; parity with today's deterministic set

## 7. Ship

- [ ] 7.1 Land each stage behind the existing canvas flag; flip only after its CT gate is green
- [ ] 7.2 Update run-canvas / instant-canvas-edits docs to describe the projection model and the identity-first write path
