# Tasks

## 1. Semantic-lever → token resolver (core, deterministic)

- [x] 1.1 Define the lever model in `packages/core`: a `DesignSystemLever` set (`color.primary|secondary|tertiary`, `radius.card`, `stroke.component`, `shadow.default`, `button.style`) with a `kind` (color | length | shadow | component) and, for `button.style`, its per-slot decl shape.
- [x] 1.2 Add a per-source map `LEVER_TOKENS: Record<source|library, Partial<Record<Lever, target>>>` where a target is a token name (global) or a `data-component` override descriptor. Seed Astryx (confirmed: `--color-accent`, `--radius-container`, `--color-border`, `--shadow-*`), built/Figma (owned `--color-primary`/etc.), and the theme-object libs (reuse the token↔theme-key map for `palette.primary.main` etc.).
- [x] 1.3 Implement `resolveDesignSystemLevers(projectPath) → Array<{ lever, target, currentValue?, supported }>` reading config + `getInspectorTokens` (overlay-aware) so each lever shows its live value; `supported:false` when unmapped. Pure/unit-tested.
- [x] 1.4 Expose it over IPC (`designSystem:levers`) + `api` for the UI.

## 2. The curated editor UI (Variables sidebar = controls, main panel = live palette)

- [x] 2.1 Add a `DesignSystemEditor` panel portaled into the left dock's section slot — the SAME sidebar the Tokens tab fills with its variable tree — shown when the Design-tokens sub-tab is "Design system", so the sidebar carries the controls for whatever the main panel shows and the palette keeps full width to re-theme in.
- [x] 2.2 Render each supported lever with the right control: color input (colors), px stepper (radius/stroke), preset/value (shadow), and a small button-styling group (fill / text / radius) for `button.style`. Hide/disable unsupported levers.
- [x] 2.3 On change, write via the existing IPC: global levers → `theme:setTokenOverride`; `button.style` → `theme:setComponentOverride("Button", …)`. Debounce; validate values before write.
- [x] 2.4 Reload the palette on each committed edit (the editor bumps the palette's `reloadSignal`; `afterTokenEdit` re-resolves) so the change shows immediately for css-vars/overlay sources.
- [x] 2.5 For a theme-object library, surface the "Customize theme" dispatch inline in the editor (the overlay can't render as CSS there) instead of a silent no-op; the detached header button in the palette view is retired.

## 3. Consume-source surfacing

- [x] 3.1 Make the Design System tab (and its sidebar controls) the default/primary surface for `design_source: library` (Storybook already hidden — Part A). Add a short one-line hint that tokens are editable here and changes are deterministic + non-destructive to the vendor source.
- [x] 3.2 Confirm the editor never writes the vendor `token_file` (the consume guard already routes to the overlay) — assert in a test.

## 4. Verification

- [x] 4.1 Unit: `resolveDesignSystemLevers` returns correct per-source targets (Astryx vs built vs MUI) and marks unmapped levers unsupported.
- [x] 4.2 Fixture: editing "Primary color" / "Card radius" on a consumed-library project writes the overlay (not the real token file) and the overlay-aware reader reflects the new value.
- [x] 4.3 Fixture: `button.style` writes a `data-component="Button"` override that scopes to Button only.
- [x] 4.4 Manual: on AstryxTest, move each lever and confirm the Design System palette re-themes live.

## 5. Read a token file's `@import` chain (found during 4.4 — see design D7)

- [x] 5.1 Add `resolveCssImports(projectPath, entry)` — flattens `@import` in cascade order, resolving relative partials AND bare package specifiers through the package's `exports` map; cycle/depth/size capped; returns per-file segments + the files read.
- [x] 5.2 Read tokens from the flattened chain in `getInspectorTokens`, and fingerprint the imported files so a vendor theme bump invalidates the scan.
- [x] 5.3 Attribute each token to the file that declares it (`fromImport`), cascade-correct (the importing file wins).
- [x] 5.4 Treat `:scope` (inside `@scope (…)`) as the default context — that is where a themed library declares its base token values.
- [x] 5.5 Write where the token actually lives: a project-owned partial in place, a token from `node_modules` to the durable overlay. Extend the rename/delete snapshot to imported project partials.
- [x] 5.6 Support `light-dark(light, dark)` values: read as a color, swatch edits the LIGHT half, the library's dark mode is preserved.
- [x] 5.7 Tests: import resolution (package `exports`, relative partials, cycles, unresolvable), the vendor package is never written, and the palette re-themes after an overlay edit.

## 6. Reconcile the design system FROM the screens (proposal → adopt)

- [x] 6.1 `readScreenTokens(projectPath)` — parse each `.vortspec/light-pages/*.html` `<style>` root block into the tokens that screen declares; component-local redeclarations are ignored; a disagreement across screens is won by the majority and the dissenters are reported.
- [x] 6.2 `sameDesignValue(a, b)` — equivalence that avoids false alarms: `light-dark()` compared on its light half, hex shorthand/opaque-alpha normalized, `rem` resolved at 16px so `0.75rem` == `12px`.
- [x] 6.3 `computeScreenDrift(levers, screenTokens)` — per LEVER only; carries both values plus an `adoptValue` that preserves a `light-dark()` token's dark half (a light page states light mode only).
- [x] 6.4 Expose over IPC (`designSystem:screenDrift`) + `api`.
- [x] 6.5 UI: a proposal banner at the top of the Design system sidebar — per-lever "Adopt from screens" + "Adopt all", with a swatch/value comparison. Nothing is applied until the user adopts; adopting writes the SAME durable overlay (vendor files untouched).
- [x] 6.7 Refresh the proposal LIVE: subscribe to the workspace watcher, filtered to `.vortspec/light-pages/` and coalesced, so a screen created or edited while the panel is open updates the banner without switching tabs. Re-reads only the drift, so the panel doesn't rebuild under the user's cursor.
- [x] 6.8 Reference-count the workspace watcher (`fs-workspace`): the Explorer and this panel can both hold it, and before counting whichever unmounted first silently killed the other's updates. Tested.
- [x] 6.6 Tests: root-block parsing vs. component-local, majority + conflicts, no-screens, px/rem equivalence not reported as drift, non-lever invented tokens ignored, adopt writes the overlay and clears the drift.

## 7. Make a lever actually move the screens (found in use)

- [x] 7.1 Once a lever has a durable override, the design system OWNS that token: the screens follow it and it is never proposed back as drift — the banner must not ask the user to undo the edit they just made.
- [x] 7.2 Regression test: the injected overlay lands AFTER a screen's own `:root`, so a lever edit wins the cascade on pages the user already built.
- [x] 7.3 Give each lever an explicit ALIAS set (synonyms for the same decision) and drive every alias the screens declare — so "Card radius" moves the screens' `--radius-card`, not just the library's `--radius-container`.
- [x] 7.4 Aliases are an equivalence class, NOT the lookup candidates: another step of a scale (`--radius-pill`, `--radius-element`, `--shadow-sm`/`-md`) is never swept in, which would flatten the scale. Tested for both radius and shadow.
- [x] 7.5 Disclose the extra reach in the lever's hint ("Also updates --radius-card — your screens use it for the same thing").
