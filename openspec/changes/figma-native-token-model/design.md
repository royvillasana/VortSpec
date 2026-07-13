## Context

Two-way token sync already exists: Figma→code reconcile (`.vortspec/figma-variables.json` → `reconcile()`) and code→Figma push (`figma-push.ts` → figma-cli `buildPushScript`). Both operate on a **flattened** view that discards the three things that actually define a Figma variable's identity and value: its **collection**, its **modes**, and its **group path**. This design first pins down how Figma models those (the user's explicit "first understand" requirement), then specifies how VortSpec mirrors them end-to-end so reconcile stops producing false discrepancies.

### How Figma models variables (the ground truth we must mirror)

**1. Collections define modes.** A `VariableCollection` is the container; every variable belongs to exactly one collection. The collection owns an ordered list of **modes** — each `{ modeId, name }`. A brand-new collection has one mode ("Mode 1"); a themed collection has several (e.g. `Light`, `Dark`) or (e.g. `Desktop`, `Tablet`, `Mobile`). Modes are the collection's axes of variation. `collection.defaultModeId` names the fallback mode. VortSpec does **not** author modes; it reads them and maps them to code contexts.

**2. A variable stores one value *per mode*.** A `Variable` has a single `resolvedType` (`COLOR | FLOAT | STRING | BOOLEAN`) and a `valuesByMode` map: `modeId → value`. So `color/primary` in a Light/Dark collection holds two values — one keyed by the Light modeId, one by the Dark modeId. There is no "the value" of a variable; there is only its value **in a given mode**. This is exactly what today's single `resolvedValue` throws away, and why "first mode wins" mislabels drift.

**3. A per-mode value is either a raw value or an alias.** A `valuesByMode` entry is either a concrete value (a color `{r,g,b,a}` 0–1, a number, a string, a boolean) **or** a `VariableAlias` `{ type: "VARIABLE_ALIAS", id }` pointing at another variable. Aliases are how Figma expresses `semantic/bg → primitive/color/white`. The *resolved* value follows the alias chain to a concrete value; the *raw* value is the alias. This is the direct analog of the code side's `var(--x)` — the push already tries to preserve it, but only for a single mode and against a name-flattened target set.

**4. Groups/folders are a naming convention, not objects.** Figma has **no folder object**. A variable named `primitive/color/primary` simply *renders* nested under `primitive` → `color`, with the leaf label `primary`. The `/` is the only grouping mechanism. So: **group path = `name.split("/")` minus the last segment; leaf label = last segment; indentation depth = path length − 1.** The DTCG export already round-trips this (`dtcgToVariables` joins the tree path with `/`), and `.vortspec/figma-variables.json` already stores `color/primary` — we just discard the structure at `normName` (which turns `/` into `-`) and never render it as a tree.

**5. Code has no `/`, so the boundary needs a convention.** CSS custom-property names can't contain `/`; the universal convention (and what VortSpec already assumes) is `/`↔`-`: Figma `color/primary` ↔ CSS `--color-primary`. This is lossy in one direction (`color-primary` in code is ambiguous — was it `color/primary` or a flat `color-primary`?). We resolve the ambiguity by treating the **Figma variable set as authoritative for path shape**: when a code token matches a Figma variable, it inherits that variable's group path; a code-only token keeps its `-`-segmented name as a best-effort path.

**6. Modes ↔ code contexts.** Code expresses "modes" as **selector/context scopes** in the token file, not a map: `:root { --x: … }` (default/Light), `.dark { --x: … }` or `[data-theme="dark"] { … }` or `@media (prefers-color-scheme: dark) { :root { … } }` (Dark). A Tailwind v4 `@theme` block is a single default context. So mapping modes to code means mapping each Figma modeId/name to the selector that carries its values. This mapping is the crux of round-tripping per-mode values.

## Goals / Non-Goals

**Goals:**
- Represent collections, modes, group paths, and aliases faithfully in the `.vortspec` cache and the token model.
- Reconcile per mode, matched on full group-qualified name, so an in-sync variable never reads as drift and a genuine per-mode difference is caught.
- Render tokens as Figma's variable tree: collection scope → indented group folders → leaf tokens, with a mode switcher.
- Preserve modes, group paths, and aliases on push.
- Keep VortSpec's non-negotiables: no direct Figma access (figma-cli / scoped Claude Code only), gated mutations, local-first plain files, zod at boundaries only.
- Back-compatible cache: today's flat `figma-variables.json` still parses (as a single-mode, path-from-name view).

**Non-Goals:**
- Authoring Figma mode/collection structure from VortSpec (add/rename/delete modes or collections).
- Auto-generating dark-mode (or any non-default) code contexts that don't already exist in the token file. If a mode has no code context, VortSpec shows the Figma value read-only and flags "no code context for mode X" rather than inventing a `.dark` block.
- Resolving aliases into concrete values in the model (we keep both raw alias + resolved value, as the parser already does for `var()`).
- Any change to component reconcile (`figma-components.json`).

## Decisions

### D1: Extend the cache to a mode/group/alias-aware shape; keep the flat shape parseable
`.vortspec/figma-variables.json` becomes an object with `collections` (each: `name`, `modes: [{id,name}]`, `defaultModeId`) and `variables` (each: `name` (slash path), `collection`, `resolvedType`, `valuesByMode: { [modeName]: { value?, aliasOf? } }`). `readFigmaVariables` detects shape: **new object** → parse richly; **legacy array / flat map** → wrap as a one-mode collection (`"Default"`) with `valuesByMode: { Default: { value } }`, path taken from the name. *Alternative considered:* a second file `figma-collections.json`. Rejected — one authoritative cache is simpler and the reconcile already reads one file.

Keying by **mode name** (not modeId) in `valuesByMode` keeps the cache human-diffable and stable across re-exports (modeIds are opaque and can churn); the collection's `modes` list preserves order + the id↔name relation for the pusher.

### D2: Group path is first-class; `normName` keeps matching, path travels alongside
Add a `figmaPath` (string, slash form) and derived `group: string[]` to `FigmaVariable` and the token model. **Matching still uses `normName`** (so `color/primary` ↔ `--color-primary` continues to match), but the matched entry now carries the authoritative Figma path, which drives display nesting and push naming. *Alternative considered:* change the match key to the exact slash path. Rejected — it would break matching for every existing code token that uses `-`, i.e. all of them.

### D3: Reconcile is per-mode against the active mode
`reconcile(tokens, figmaModel, activeMode)` compares each code token's value **in the active mode's code context** to the Figma variable's value **in the corresponding mode**. Output drift is per (token, mode). The Inspector's mode switcher selects `activeMode`; drift counts recompute. When the code file has no context for a mode, the token is `figma-only-for-mode` (read-only) rather than `drifted`. *Alternative considered:* reconcile all modes at once and show a matrix. Deferred — a matrix is a good future view, but the mode switcher covers the sync need with far less UI surface.

### D4: Mode↔context mapping is derived-then-overridable, persisted in project config
Default mapping by heuristic on the token file's selectors: `:root`/`@theme`/`html` → default mode (first Figma mode / `defaultModeId`); `.dark`, `[data-theme="dark"]`, `@media (prefers-color-scheme: dark)` → a mode whose name matches `/dark/i`; otherwise best-effort by name. The resolved map is shown and editable, persisted to the project config (`config-manager`) as `tokenModeMap: { [figmaMode]: <selector/context> }`. *Alternative considered:* infer silently with no override. Rejected — mode naming is too free-form (`Dark`, `Night`, `Mode 2`) to guess reliably; a visible, editable map is the transparent-cockpit answer.

### D5: Parser reads values per context
`parseTokensFromCss` currently merges all `--x` declarations with "last wins". It becomes context-aware: collect declarations per selector scope, producing `valuesByContext: { [context]: rawValue }` per token. The default context feeds today's single-value paths (back-compatible); additional contexts feed the mode switcher. `var()` resolution runs **within a context** (a `.dark` var resolves against `.dark` then `:root`). *Alternative considered:* a CSS AST library. Rejected for now — a scoped brace-matching pass over selector blocks is enough for the token-file shapes we support and avoids a new dependency; isolate it so it can be swapped later.

### D6: Push carries mode + path + alias
`computePushPlan(tokens, figmaModel, { collection, mode })` emits entries with the target **mode**, the **group path** (write `color/primary`, never `color-primary`), and `aliasTarget` resolved within that mode. `buildPushScript` sets values via `setValueForMode(targetModeId, …)` for the mapped mode (creating the variable under the right slash name so Figma folders it correctly), and binds aliases per mode when the target's `resolvedType` matches. The existing per-entry try/catch + type coercion stays. *Alternative considered:* push all modes in one plan. Deferred — push the active mode (matching what the user sees/edits); multi-mode push is a follow-up once single-mode is proven.

### D7: UI — collection scope + indented folder tree + mode switcher
The Tokens panel gains: a **collection selector** (when >1 collection), a **mode switcher** (when the active collection has >1 mode), and a **folder tree** where group segments render as collapsible headers with left-indentation per depth; the existing type filter becomes a secondary chip filter. Leaf rows are unchanged (swatch/name/value/badge/uses) except the value shown is the active mode's. Drift/source badges reflect the active mode. Degrades cleanly: a single-collection, single-mode, flat-named project looks like today (one implicit collection, one mode, shallow tree).

## Risks / Trade-offs

- **Ambiguous `-` vs `/` in code-only tokens** → We only assert a folder path when a token matches a Figma variable (authoritative). Code-only tokens split on `-` as a best-effort tree; if that over-nests, the user still sees every token, just grouped differently than intended. Acceptable and reversible (it's display-only).
- **Mode↔context heuristic guesses wrong** → The map is visible and editable (D4); a wrong default is a one-click fix, never a silent mis-sync. Unmapped modes are read-only, never written.
- **Cache schema migration** → `readFigmaVariables` parses both shapes (D1), so an old cache from a prior VortSpec keeps working until the next sync rewrites it richly. No forced re-sync.
- **Token files we can't context-parse** (exotic selectors, CSS-in-JS) → fall back to a single default context (today's behavior) and surface "only default mode detected" rather than failing. The scoped brace-matcher is isolated (D5) so it can be upgraded.
- **Scope creep toward a full mode matrix** → explicitly deferred (D3); ship the switcher first.

## Migration Plan

1. Land the richer `figmaVariableSchema` + back-compatible `readFigmaVariables` (both shapes parse) — no behavior change until capture emits the new shape.
2. Update capture (DTCG flatten + MCP-fallback instruction) to emit collections/modes/paths/aliases; existing caches keep working.
3. Make reconcile + parser mode/context-aware behind the active-mode selector (defaults to single mode → identical to today when there's one mode).
4. Ship the UI tree + mode switcher.
5. Extend push last (D6), gated + previewed as today.

Rollback: each step is additive and back-compatible; reverting the UI/reconcile changes leaves the flat path intact because the legacy cache shape still parses.

## Open Questions

- **Alias display in the tree:** show aliased tokens with a link glyph to their target (like `var()` today) — confirm the exact affordance during UI build.
- **Non-default modes with no code context:** read-only + "add a `.dark` context?" nudge is out of scope here; confirm whether even the *nudge* is wanted or if silent read-only is enough.
- **Collection the push targets:** today VortSpec owns a `VortSpec` collection. When the user is viewing an *imported* Figma collection with modes, does push target that collection's active mode, or still the `VortSpec` collection? Leaning: push targets the collection currently in view (fall back to `VortSpec` when viewing code-only tokens) — confirm at push-implementation time.
