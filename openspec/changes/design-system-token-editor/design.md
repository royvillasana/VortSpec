## Context

Part A (shipped) hid the Storybook activity item for `design_source: library` so the Design System view
(the default tab of the Design-tokens workspace) is a consumed library's component surface. Part B adds the
curated editor there. All the write/apply plumbing exists from `consume-component-libraries`:
`setThemeTokenOverride` / `setThemeComponentOverride` → `.vortspec/theme-overrides.json` → materializer
(`materializeThemeCss` / `materializeComponentCss`) → live re-theme (`afterTokenEdit` re-runs
`writeDesignerMd` + busts the palette cache). This change is mostly a UI surface + a deterministic
lever→token map; it introduces no new write path and no AI in the edit loop.

## Goals / Non-Goals

- **Goals:** a curated, deterministic editor for the named levers, beside the live palette, that re-themes
  the design system in place; a per-source semantic-lever → token(s) map; never mutate the vendor source.
- **Non-Goals:** authoring components; a full theme-object codegen (theme-object libs already have the
  "Customize theme" dispatch); redefining a library's theme abstraction (Astryx `defineTheme` is out of
  scope — VortSpec overrides token VALUES only).

## Decisions

### D1. The editor lives in the Design System tab (editor + live preview)
The Design-tokens workspace already pairs a "Tokens" tab (`Inspector`, the raw table) and a "Design system"
tab (the palette). Make the Design System tab an **editor + preview**: curated controls on the left, the
existing palette iframe on the right. This is exactly where the user asked ("the design token section on the
sidebar … manipulate everything there and see those changes on the design system") and reuses the palette
that's already there. The raw `Inspector` table stays as the power-user "Tokens" tab.

### D2. Semantic-lever → token(s) map per source (the one new deterministic piece)
A lever is a human concept; it must resolve to concrete write targets for the current source:

| Lever | Astryx (css-vars) | Built / Figma (owned CSS) | Theme-object (MUI) |
|---|---|---|---|
| Primary color | `--color-accent` | `--color-primary` / brand ramp | `palette.primary.main` |
| Secondary / Tertiary | accent/secondary tokens | `--color-secondary/-tertiary` | `palette.secondary.*` |
| Card radius | `--radius-container` | `--radius-lg`/card radius | `shape.borderRadius` |
| Component stroke | `--color-border` (+ width) | border token(s) | `palette.divider` |
| Shadows | `--shadow-*` | shadow token(s) | `shadows[n]` |
| Button styling | per-component `data-component="Button"` override | same | `theme.components.MuiButton` |

Model it as a small resolver `designSystemLevers(source, library, tokens)` returning, per lever, the
concrete target(s) + current value(s), so the UI is generic and the mapping is data. It is a sibling of the
existing token↔theme-key map (Plan 12.6) and reuses it where a theme-object path is needed. A lever with no
resolvable target for the current source is **hidden/disabled, never guessed**.

### D3. Writes reuse the existing overlay path (no new write path)
- Global levers (colors, radius, stroke, shadow) → `setThemeTokenOverride(name, value)`.
- Button styling (and any per-component lever) → `setThemeComponentOverride("Button", target, decls)`.
Both already route to `.vortspec/theme-overrides.json`, are guarded from touching the vendor source, and
re-theme live. The editor is a thin, deterministic front-end over these IPC calls.

### D4. Live re-theme
Every lever edit triggers the existing `afterTokenEdit` re-resolution (designer.md + palette cache bust);
the Design System preview reloads via the palette `reloadSignal`. For css-vars/overlay sources (Astryx,
built, enterprise) the change is immediate. For a theme-object library the overlay can't render as CSS, so
the editor surfaces the already-built **"Customize theme"** action (Phase 11) to materialize it — no new
mechanism.

### D5. Deterministic + safe
No AI in the edit path — a lever maps to a token and writes a value. Colors use a color input; radius/stroke
use px steppers; shadows a small preset set or an editable value. Values validate before write. The vendor's
real `token_file` is never written (the consume guard already enforces this).

### D6. Scope: consumed libraries first, generalizes later
Ship for `design_source: library` (+ enterprise, which already overlays). The map has a "built/Figma" column
so extending to owned design systems is a later, additive step, not a rewrite.

## Risks / Trade-offs

- **Per-library map coverage** — the lever→token map must be right per library; a wrong mapping writes the
  wrong token. Mitigate: hard-code only well-known mappings (Astryx confirmed from docs; MUI/shadcn stable),
  hide unmapped levers, and let the raw Tokens tab cover everything the curated editor doesn't.
- **Astryx custom-theme limit** — button "styling" beyond token values (e.g. new variants) is Astryx's
  `defineTheme`, which VortSpec can't express; the editor exposes only token-value levers and says so.

## Open Questions

1. **Button styling granularity** — which sub-levers for v1 (fill, text color, radius, padding)? Keep it to
   token-backed properties, or allow a small per-slot set?
2. **Per-library map authoring** — hard-code the maps (fast, needs upkeep per library) or derive some from
   the token names present + the theme-key map (more general, less certain)?
3. **Generalize now or later** — ship consumed-library only, or include the built/Figma column in v1 so any
   design system gets the curated editor?
