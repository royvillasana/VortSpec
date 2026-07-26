## 1. Projected node tree (read-only first — no behavior change)

- [ ] 1.1 Define the `ProjectedNode` model: stable `id` (fingerprint/classSignature), `tag`, parent/children, `props`, `text`, `dataSource` (hint), `dataDriven` flag
- [ ] 1.2 Build the projection from the inspector bridge's structure snapshot + readouts; keep it in sync on bridge updates
- [ ] 1.3 Mark `dataDriven` subtrees (rendered inside `.map`/conditional over non-local data) from the resolvability analysis
- [ ] 1.4 Dev-only assertion: the projected tree matches the live DOM (same nodes, order, identities) — prove parity before routing anything through it

## 2. Route reads through the tree

- [ ] 2.1 Layers panel + selection read from the projection (not ad-hoc DOM walks)
- [ ] 2.2 Dirty set keyed by node `id` (not `(file, nodeId)` positional)

## 3. Identity-located reconciliation (retire positional writes)

- [ ] 3.1 Reconciler: diff the tree vs. last-persisted tree → minimal codemod set
- [ ] 3.2 Locate each target JSX by identity (`matchBySignature`), `data-source` only as a tiebreaker; line:col never drives a write
- [ ] 3.3 Reuse the existing codemods as emit targets (no new codemods); route set-prop/text/move/insert/remove/reorder through the reconciler
- [ ] 3.4 Retire the positional write path + its mitigations (RT-3 descending-line ordering, DR-2 anchor re-location) once parity holds
- [ ] 3.5 Data-driven structural mutations hand off explicitly (local array edit, else assistant) from the `dataDriven` flag — no dead-end AI run

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
