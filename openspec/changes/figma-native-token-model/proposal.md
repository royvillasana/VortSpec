## Why

VortSpec's token model is **flat and mode-blind**, so it can never reconcile cleanly with Figma. Figma organizes variables into **collections** that define **modes** (Light/Dark, Desktop/Mobile…), stores **one value per mode** on each variable, and nests variables into **group folders** via a `/` path (`primitive/color/primary`). VortSpec throws all three away: the `.vortspec/figma-variables.json` cache carries a single `resolvedValue` per variable, `reconcile()` explicitly takes "first mode wins", `normName()` flattens the group path (`/`→`-`) so `color/primary` and `color-primary` collapse together, and the Inspector groups tokens only by *inferred type* (Color/Typography/…), never by the actual Figma folder tree. The result: a variable that is genuinely in sync in Figma's Light mode reads as drift (or a false match) here, and the app can't show — or push — the structure the designer actually authored. To make two-way sync trustworthy, VortSpec must model tokens the way Figma models them.

## What Changes

- **Capture the full Figma structure, not a flattened snapshot.** The variable export (figma-cli DTCG path + the scoped-Claude MCP fallback) records, per variable: its **collection**, its **group path** (the `/`-segmented name), its **resolvedType**, and its **value in every mode** — plus whether a per-mode value is a **variable alias** (a reference to another variable) rather than a raw value. `.vortspec/figma-variables.json` gains a richer, back-compatible shape (old flat arrays still parse).
- **A mode-aware, group-aware token model.** `FigmaVariable` grows `collection`, `path` (group segments), and `valuesByMode`/alias info; the Inspector token model tracks which **mode** each code value corresponds to and the token's **group path**.
- **Reconcile per mode and by full path — no lossy flattening.** Drift is computed for the active mode against the matching mode's Figma value, matched on the full group-qualified name, so `color/primary` (Light) is compared to the code's Light value only. This removes the false-discrepancy class the current "first mode wins + name flattening" produces.
- **Display tokens as Figma's variable tree.** The Tokens panel nests tokens into collapsible **group folders** mirroring the Figma `/` hierarchy (with indentation), scoped to a **collection**, with a **mode switcher** that swaps the displayed/edited values. Type grouping becomes a secondary filter, not the primary structure.
- **Map modes ↔ code contexts.** A documented, configurable mapping ties each Figma mode to a CSS selector/context in the token file (`:root`, `.dark` / `[data-theme="dark"]`, `@media (prefers-color-scheme: dark)`), so per-mode values round-trip. The token parser reads values per context; unknown/absent contexts degrade to a single default mode (today's behavior).
- **Push preserves modes, group paths, and aliases.** The code→Figma push writes the value for the selected mode, keeps the group path (`color/primary`, not `color-primary`), and re-creates `var(--x)` references as variable aliases per mode where the target exists.
- **Non-goals (this change):** no new Figma network access from VortSpec (still delegated to figma-cli / scoped Claude Code); no editing of Figma mode/collection definitions (add/rename/delete modes) from VortSpec; no automatic authoring of dark-mode code contexts that don't already exist.

## Capabilities

### New Capabilities
- `figma-variable-model`: the mode-aware, group-aware representation of Figma variables — collections, modes, group paths, per-mode values, and aliases — captured in the `.vortspec` cache, reconciled against code without lossy flattening, and preserved on push. Covers the shared data model + capture/reconcile/push semantics.

### Modified Capabilities
- `inspector-tokens`: the Tokens panel SHALL present tokens as Figma's variable tree — nested collapsible group folders mirroring the `/` hierarchy with indentation, scoped by collection, with a mode switcher — and compute drift per mode against the matching Figma mode value rather than a single flattened value.

## Impact

- **Contracts (`packages/core/src/shared/inspector.ts`):** `figmaVariableSchema` gains `collection`, `path`/group segments, `modes`/`valuesByMode`, and alias info; `inspectorTokenSchema` and `inspectorTokensResultSchema` gain group path, collection, and per-mode value fields; new mode-mapping config. Zod stays at the parse boundary only.
- **Capture (`packages/core/src/main/figma/figma-cli.ts`):** `dtcgToVariables` and the DTCG/`eval` export must retain per-mode values + slash paths + alias refs (DTCG already emits slash paths — stop discarding them); the MCP-fallback export instruction updates to emit the richer shape. Back-compatible parse in `readFigmaVariables`.
- **Reconcile (`packages/core/src/main/inspector/figma-reconcile.ts`):** `reconcile()` becomes mode- and path-aware; `normName` stops being the match key for group-qualified names (or gains a path-preserving variant). `figma-push.ts` `computePushPlan` carries mode + group path + alias.
- **Parser (`packages/core/src/main/inspector/token-parser.ts`):** parse per code-context (mode) instead of a single merged `:root`; map contexts↔modes.
- **UI (`packages/ui/src/views/Inspector.tsx`):** group-folder tree with indentation, collection scope, mode switcher; drift/badges per mode.
- **Cache files:** `.vortspec/figma-variables.json` schema revision (back-compatible); optional mode-map persisted under `.vortspec/`.
- **Tests:** unit fixtures for multi-mode / grouped DTCG exports, path-preserving reconcile, per-mode push plans; Inspector render tests for the folder tree + mode switcher.
- **Docs:** a short "How Figma models variables (modes, groups, aliases) and how VortSpec mirrors it" note, satisfying the user's "first understand" requirement.
