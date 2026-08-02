# Tasks

## 1. Semantic-lever → token resolver (core, deterministic)

- [ ] 1.1 Define the lever model in `packages/core`: a `DesignSystemLever` set (`color.primary|secondary|tertiary`, `radius.card`, `stroke.component`, `shadow.default`, `button.style`) with a `kind` (color | length | shadow | component) and, for `button.style`, its per-slot decl shape.
- [ ] 1.2 Add a per-source map `LEVER_TOKENS: Record<source|library, Partial<Record<Lever, target>>>` where a target is a token name (global) or a `data-component` override descriptor. Seed Astryx (confirmed: `--color-accent`, `--radius-container`, `--color-border`, `--shadow-*`), built/Figma (owned `--color-primary`/etc.), and the theme-object libs (reuse the token↔theme-key map for `palette.primary.main` etc.).
- [ ] 1.3 Implement `resolveDesignSystemLevers(projectPath) → Array<{ lever, target, currentValue?, supported }>` reading config + `getInspectorTokens` (overlay-aware) so each lever shows its live value; `supported:false` when unmapped. Pure/unit-tested.
- [ ] 1.4 Expose it over IPC (`designSystem:levers`) + `api` for the UI.

## 2. The curated editor UI (Design System tab = editor + preview)

- [ ] 2.1 Add a `DesignSystemEditor` panel (controls) rendered on the left of the Design System tab, the existing palette iframe on the right (split), so edits re-theme the palette in place.
- [ ] 2.2 Render each supported lever with the right control: color input (colors), px stepper (radius/stroke), preset/value (shadow), and a small button-styling group (fill / text / radius) for `button.style`. Hide/disable unsupported levers.
- [ ] 2.3 On change, write via the existing IPC: global levers → `theme:setTokenOverride`; `button.style` → `theme:setComponentOverride("Button", …)`. Debounce; validate values before write.
- [ ] 2.4 Reload the palette on each committed edit (reuse the palette `reloadSignal` / `afterTokenEdit` re-resolution) so the change shows immediately for css-vars/overlay sources.
- [ ] 2.5 For a theme-object library, surface the existing "Customize theme" dispatch inline (the overlay can't render as CSS there) instead of a silent no-op.

## 3. Consume-source surfacing

- [ ] 3.1 Make the Design System tab the default/primary surface for `design_source: library` (Storybook already hidden — Part A). Add a short one-line hint that tokens are editable here and changes are deterministic + non-destructive to the vendor source.
- [ ] 3.2 Confirm the editor never writes the vendor `token_file` (the consume guard already routes to the overlay) — assert in a test.

## 4. Verification

- [ ] 4.1 Unit: `resolveDesignSystemLevers` returns correct per-source targets (Astryx vs built vs MUI) and marks unmapped levers unsupported.
- [ ] 4.2 Fixture: editing "Primary color" / "Card radius" on a consumed-library project writes the overlay (not the real token file) and the overlay-aware reader reflects the new value.
- [ ] 4.3 Fixture: `button.style` writes a `data-component="Button"` override that scopes to Button only.
- [ ] 4.4 Manual: on AstryxTest, move each lever and confirm the Design System palette re-themes live.
