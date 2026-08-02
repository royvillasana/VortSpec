## Why

The curated design-system editor shipped as a **lever** panel: seven semantic knobs, each hard-wired to one
token per design source, rendered in the Design-tokens sidebar next to a static palette. Real use broke both
halves of that:

- **A fixed lever list can't describe a real design system.** "Card radius" drove Astryx's
  `--radius-container` while the screens rounded their cards with `--radius-card` — the knob moved 5
  elements and none of the cards. Patching it took a per-lever alias set, then a second fix to stop that
  alias set flattening the shadow ramp. The gaps that remain are structural: `--radius-pill`,
  `--radius-element`, the whole spacing scale and all typography have no lever, so they stay unreachable.
- **The panel is nowhere near the work.** The user's loop is "change a value, see the screens change", and
  the screens live in the Playground canvas.

Separately, the Playground sidebar has an ordering problem of its own: the layers tree and the selected
element's property sections are **siblings in one scroll column**, so a selection's attributes float beside
the tree instead of reading as "this layer, and its properties".

## What Changes

- **Restructure the Playground sidebar below its existing Pages region** into the shape from the design:
  the **Pages** (Sitemap) region stays on top, and everything the design shows sits beneath it — a
  **layers tree** (its own scroll, resizable), then a **tabbed region** with two tabs, **Design Attributes**
  and **Library**. Selecting a layer in the tree fills Design Attributes below it.
- **Design Attributes keeps TODAY'S property sections, unchanged.** Only its container changes — it moves
  from being a sibling of the tree into the tab. The attribute controls drawn in the design mock are
  illustrative and are explicitly NOT adopted.
- **Library is the new design-system tab**, laid out as the design shows: a **Live Preview** that reflects
  current token values, a **Mode** switch (Manual · Presets), and — in Manual — five sections:
  **COLORS**, **TYPOGRAPHY**, **SPACING**, **BORDERS**, **SHADOWS**.
- **A section's rows FOLLOW THE PROJECT.** The design draws canonical rows (Primary/Secondary/Tertiary,
  H1…Caption, xs…xl), but a real project's roles are its own — so the rows are the project's actual tokens
  of that type, grouped into the five sections. This is the difference from the lever model: nothing is
  stranded because VortSpec has no name for it.
- **Presets** are named bundles of design-system values, shipped as built-ins:
  - **Default** is not a stored template — it IS this project's own design system, inherited from its
    component library. Editing values in Manual mode changes what Default is.
  - **Ocean**, **Forest** and **Sunset** ship with VortSpec as fixed variations (type + palette + radius).
  - Applying a preset writes its values through the same overlay. **Editing afterwards edits the PROJECT,
    never the preset** — a built-in is a starting point, not a live binding.
  - A preset MAY introduce a role the project lacks (a project with no type scale gets one from the preset),
    written to the overlay like any other value.
- **Replicate, don't move**: the Library tab's editor is also mounted in the Design-tokens sidebar, from one
  implementation, so it exists next to the palette AND next to the screens.
- **BREAKING (internal)**: the lever model — `DesignSystemLever`, `LEVERS`, `LEVER_TOKENS`, the alias sets
  and `designSystem:levers` — is superseded and removed. No external consumers.
- **Kept unchanged**: the durable overlay write path and consume guard (a vendor's files are never written),
  `@import` resolution of the token file, `light-dark()` light-half editing, and the screens→design-system
  drift reader.

## Capabilities

### New Capabilities
- `design-system-style-panel`: the Library tab — a design-system editor with a live preview, a Manual mode
  of five style sections (colors, typography, spacing, borders, shadows) resolved against the project's real
  tokens, and a Presets mode of named, applyable value bundles. Mounted both in the Playground sidebar and
  in the Design-tokens sidebar from one implementation.

### Modified Capabilities
- `component-token-customization`: the customization resolver becomes **property-based** — report the
  project's own tokens grouped by style property — replacing the fixed semantic-lever → token map. Role
  resolution survives only where a PRESET needs to map its roles onto this project's tokens.
- `visual-token-editing`: the Playground sidebar becomes a resizable layers tree above a two-tab region;
  the selection's property sections move into the Design Attributes tab rather than sitting beside the tree.
- `design-system-editor`: the editor is re-expressed in terms of style properties over the project's own
  tokens, and its semantic-lever mapping requirement is REMOVED — that model is what this change replaces.

## Impact

- **VortSpec UI**: `RunApp`'s `sidebarBody` is restructured (tree + resizer + tab bar); `DesignPanel`'s
  property sections become the Design Attributes tab's body; a new `LibraryPanel` is built and mounted in
  both docks; the old lever `DesignSystemEditor` is deleted.
- **VortSpec core**: a property-grouped token reader; the built-in preset definitions plus a store and
  applier (including role→token resolution, used only on apply); the lever module and its per-source map are
  deleted. The overlay writer, `css-imports` and
  `screen-tokens` readers are reused as-is.
- **In-flight change**: `design-system-token-editor` is unarchived and introduced the lever model this
  replaces. Its shipped foundations stay; its lever-shaped editor does not. It should be archived first so
  these deltas apply to a settled baseline.
- **Pages stays**: the existing `Sitemap` region remains at the top of the sidebar; the designed tree +
  tabs region sits below it.
