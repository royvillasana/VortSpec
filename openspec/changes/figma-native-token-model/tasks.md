## 1. Contracts (shared model)

- [x] 1.1 Extend `figmaVariableSchema` in `packages/core/src/shared/inspector.ts` with `collection`, `figmaPath` (slash form) + derived `group: string[]`, `resolvedType`, and `valuesByMode` (mode name → `{ value?, aliasOf? }`); add a `figmaCollectionSchema` (`name`, `modes: [{id,name}]`, `defaultModeId`) and a `figmaVariableModelSchema` (`collections`, `variables`).
- [x] 1.2 Extend `inspectorTokenSchema` / `inspectorTokensResultSchema` with `figmaPath`/`group`, `collection`, per-mode `valuesByContext`, and per-mode `drift`; add an `activeMode` + `modes`/`collections` summary to the result.
- [x] 1.3 Add a `tokenModeMap` shape to the project config contract (`config-manager`) — `{ [figmaMode]: <context selector> }` — plus zod parse at the boundary.
- [x] 1.4 Keep every new field optional/defaulted so a single-collection/single-mode/flat project (and the legacy cache) still validates unchanged.

## 2. Capture (Figma → cache)

- [x] 2.1 Rework `dtcgToVariables` (and the DTCG export path in `figma-cli.ts`) to retain the slash group path, per-mode values, `resolvedType`, and alias references instead of a single `resolvedValue`.
- [x] 2.2 Update `syncVariablesToCache` to write the new `figma-variables.json` object shape (collections + variables); ensure the DTCG export requests all modes.
- [x] 2.3 Update the scoped-Claude MCP-fallback export instruction (`FIGMA_SYNC_PROMPT` / sync-tokens skill note) to emit the richer shape (collections, modes, group paths, aliases).
- [x] 2.4 Make `readFigmaVariables` shape-detecting: parse the new object richly; wrap legacy array/flat-map as one `Default`-mode collection with path-from-name. Unit-test both shapes.

## 3. Reconcile (per mode, path-aware)

- [x] 3.1 Change `reconcile()` to take `(tokens, figmaModel, activeMode)` and compute drift per (token, mode) against the matching Figma mode value, matched on the group-qualified name; drop "first mode wins".
- [x] 3.2 Represent a mode with no code context as `figma-only-for-mode` (read-only), not `drifted`.
- [x] 3.3 Preserve the authoritative Figma group path onto matched tokens; keep `normName` as the match key (D2).
- [x] 3.4 Unit-test: in-sync mode not flagged, per-mode difference caught, unmapped mode read-only, legacy single-mode cache behaves as today.

## 4. Parser (context-aware code values)

- [x] 4.1 Make `parseTokensFromCss` collect declarations per selector context (`:root`, `.dark`, `[data-theme=…]`, `@media prefers-color-scheme`), producing `valuesByContext` per token; default context preserves today's single-value behavior.
- [x] 4.2 Resolve `var()` within a context (fall back context → default), isolated so the brace-matcher can be upgraded later.
- [x] 4.3 Derive the default mode↔context map (D4) from the file's selectors + Figma mode names; read/persist overrides via `config-manager`.
- [x] 4.4 Extend gated value edit (`setInspectorTokenValue`) to write into the active mode's context; never invent a missing context.
- [x] 4.5 Unit-test multi-context parsing + per-context `var()` resolution + map derivation.

## 5. Push (mode + path + alias)

- [x] 5.1 Extend `computePushPlan` to accept `{ collection, mode }` and emit entries carrying target mode, full group path, and per-mode `aliasTarget`.
- [x] 5.2 Update `buildPushScript` to create variables under their slash path and set values via `setValueForMode` for the mapped mode; bind aliases per mode when types match; keep the per-entry try/catch + type coercion.
- [x] 5.3 Decide + implement the target collection at push (viewed collection, else `VortSpec`) per the design's open question.
- [x] 5.4 Unit-test push plans for grouped names, a specific mode, and alias preservation.

## 6. UI (tree + mode switcher)

- [x] 6.1 Add a collection selector (shown when >1 collection) to `Inspector.tsx`.
- [x] 6.2 Replace type-first grouping with an indented, collapsible **group-folder tree** built from `figmaPath`; keep type chips as a secondary filter; folder headers show counts.
- [x] 6.3 Add a mode switcher (shown when the active collection has >1 mode); switching swaps displayed value/swatch/badge/drift and targets the active mode for edits; unmapped modes render read-only.
- [x] 6.4 Surface + edit the mode↔context map from the UI (transparent-cockpit), persisting via config.
- [x] 6.5 Recompute drift/in-sync counts for the active mode.

## 7. Docs, wiring, verification

- [x] 7.1 Add the "How Figma models variables (modes, groups, aliases) and how VortSpec mirrors it" note to `docs/`.
- [x] 7.2 Wire new IPC surface if any result fields require it (`shared/ipc.ts`, `api.ts`, preload) — reuse existing token endpoints where possible.
- [ ] 7.3 Add renderer render-tests (folder tree + mode switcher) and recorded multi-mode/grouped DTCG fixtures.
- [ ] 7.4 Verify end-to-end through the UI against a real multi-mode Figma file (figma-cli connected): sync shows the tree + modes with no false drift; edit + push round-trips per mode with folders/aliases intact.
- [x] 7.5 `pnpm build && pnpm test && pnpm lint` green.
