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

### D1. The editor lives in the Variables SIDEBAR, switched by the Design-tokens sub-tab
The Design-tokens workspace already pairs a "Tokens" tab (`Inspector`, the raw table) and a "Design system"
tab (the palette), and the left dock already has a section slot that each view portals its sidebar into —
the Tokens tab puts its variable tree there.

The curated controls belong in **that same sidebar**, switching with the sub-tab: Tokens selected → the
sidebar shows the variables; Design system selected → the sidebar shows the design-system controls. The
sidebar then always carries the controls for whatever the main panel is showing, one consistent place for
"the thing you manipulate", and the palette keeps the FULL width to re-theme in.

(An earlier revision put the controls in a split beside the palette inside the Design System tab. That was
wrong twice over: it left the Variables sidebar empty whenever the Design system tab was selected, and it
squeezed the palette — the very thing the user is trying to see change.)

The raw `Inspector` table stays as the power-user "Tokens" tab.

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

### D7. Read the token file's `@import` chain (added during 4.4)

Verifying 4.4 on the real AstryxTest project exposed a blocker the plan hadn't accounted for: a consumed
library's `token_file` **declares almost nothing**. Provisioning writes an entry that
`@import`s the vendor theme (`@import '@astryxdesign/theme-neutral/theme.css';`) and keeps only a
"project overrides" block. `getInspectorTokens` read the entry file alone, so it found **zero** tokens —
the Tokens tab and the Design System palette were empty, no lever had a live value, and an overlay edit
had nothing beside it to re-theme. The same holds for an owned system split across partials.

So token reading now resolves the `@import` chain (`css-imports.ts`) and parses the flattened text:

- **Specifiers**: relative paths and bare package specifiers, the latter resolved through the package's
  `exports` map — Astryx publishes `"./theme.css"` → `"./dist/theme.css"`, so a literal path would miss.
- **Cascade**: imported segments are inlined WHERE the `@import` stood, so the importing file still wins.
  `@import` conditions (`layer()`, `supports()`, media) are dropped — they scope where a rule applies, not
  what a custom property's value is.
- **Provenance**: each token records `fromImport` (the declaring file) when it isn't the project's own
  token file, and the cache fingerprints every file read so a vendor theme bump invalidates the scan.
- **Writes**: an edit goes to the file that actually declares the token — a project partial in place, a
  token from `node_modules` to the durable overlay (writing a dependency would be undone by the next
  install). This extends, and does not weaken, the existing consume guard.
- **`:scope`**: inside an `@scope (…)` at-rule `:scope` IS the theme root, which is where a themed library
  declares its base values — so it maps to the default context rather than a spurious mode.
- **`light-dark(light, dark)`**: read as a color; the swatch edits the LIGHT half and preserves the dark
  one, so personalizing light mode can't silently break the library's dark mode.

This is why 4.4 now holds: on the Astryx shape, all 172 vendor tokens resolve with real values, six of
seven levers are live (tertiary is honestly unmapped), and an edit re-themes the palette in place.

### D8. The design system follows the SCREENS (proposal, never automatic)

A composed light page declares its own `:root` token block using the SAME token names as the design system.
On the real AstryxTest project the screen sets `--color-accent: #5433eb` while the consumed library still
says `light-dark(#262626, #ebebeb)` — so the screen has quietly chosen a different design system, and the
Design System view shows a look nobody is building against. The user works screen-first: the look they
picked on the page IS the decision, and the design system should follow it.

Because both sides name the same tokens, the reconciliation is a deterministic name-to-name diff — no color
clustering, no guessing which hex was "the brand". Decisions:

- **Proposal, not automatic.** A drifted lever is shown with both values and an Adopt button (per lever +
  adopt all); nothing changes until the user clicks. Silently re-theming a design system from a throwaway
  experimental screen would be worse than the problem being solved.
- **Levers only.** Screens also invent tokens the library has no concept of (`--radius-card`,
  `--radius-pill`, `--color-positive`). Those are the page's own vocabulary, not a change to the library's
  design system, so they are ignored rather than injected.
- **Adopt keeps the dark half.** A light page only ever states light mode, so adopting `#5433eb` onto
  `light-dark(#262626, #ebebeb)` writes `light-dark(#5433eb, #ebebeb)` — personalizing light mode must not
  destroy the library's dark theme.
- **Equivalent spellings are not drift.** `--radius-container` is `0.75rem` in the library and `12px` in the
  screen: the same value. Reporting it would train the user to ignore the banner.
- **Majority wins across screens, dissenters named.** Screens can disagree; the value most screens use is
  proposed and the others are stated rather than hidden.
- **Same write path.** Adopting calls `setThemeTokenOverride` — the durable overlay every other lever edit
  uses — so a consumed library's real files are still never touched.
- **Live.** The proposal refreshes off the workspace watcher (filtered to `.vortspec/light-pages/`,
  coalesced), because a screen is often written by an AGENT while the user watches this panel — there is no
  IPC call to hang the refresh off. Holding that watcher here meant reference-counting it: the Explorer
  holds the same one, and before counting whichever panel unmounted first silently killed the other's
  updates.

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
