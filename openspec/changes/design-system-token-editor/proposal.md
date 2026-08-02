## Why

When a user consumes an existing component library (Astryx, MUI, Chakra, …), they don't want to author
components — they want to **personalize the look of the design system they already have**: the primary /
secondary / tertiary colors, the card corner radius, the component stroke, the shadows, how buttons are
styled. Today the only token surface is the raw Figma-style token table (`Inspector`) — powerful, but a
flat list of every token, not a curated "change my design system" experience. There is no friendly place
that says "here are the levers of your design system; move them and watch it re-theme."

The hard part is already built. The durable overlay (`.vortspec/theme-overrides.json`), the consume-source
write guard (edits route to the overlay, never the vendor's real source), the multi-format materializer,
and the live re-resolution (`designer.md` + palette re-theme on every edit) all shipped with
`consume-component-libraries`. What's missing is the **curated editor** on top of that plumbing, and the
**deterministic map** from a human lever ("Primary color", "Card radius") to the concrete token(s) it
writes for THIS source. This is Part B of the consume design-system UX (Part A — hiding Storybook so the
Design System view is the surface — already shipped).

## What Changes

- Add a **curated Design System editor** in the Design-tokens workspace's **Design System tab**: a panel of
  friendly controls on one side, the live palette on the other, so a user manipulates the levers and sees
  the design system re-theme in place. (No new sidebar section — it lives exactly where the user asked, in
  the Design tokens section, paired with the palette they already see there.)
- Levers for v1 (deterministic, per the user's list): **primary / secondary / tertiary colors**, **card
  border-radius**, **component stroke**, **shadows**, and **button styling**.
- Add a **semantic-lever → token(s) map per design source** (a small deterministic resolver, sibling to the
  token↔theme-key map): "Primary color" knows it writes `--color-accent` for Astryx, `palette.primary.main`
  for MUI, the project's own `--color-primary` for a built/Figma system, etc. A lever with no mapping for the
  current source is hidden or disabled — never guessed.
- Wire each lever through the EXISTING write path: global levers via `setThemeTokenOverride`, per-component
  levers (button styling) via `setThemeComponentOverride` (keyed on `data-component`), so writes stay in the
  durable overlay and re-theme live through the materializer. No new write path, no vendor-source mutation.

## Capabilities

### New Capabilities
- `design-system-editor`: a curated, deterministic editor for a project's design-system levers (colors,
  radius, stroke, shadow, per-component button styling), rendered beside the live Design System palette,
  writing through the durable overlay so the design system re-themes in place.

### Modified Capabilities
- `component-token-customization`: gains the semantic-lever → token(s) resolver that maps a human lever to
  the concrete token/override target for each design source.
- `visual-token-editing`: the Design System tab becomes an editor + live preview, not a read-only palette.

## Impact

- **VortSpec UI**: `DesignSystem.tsx` (or a new `DesignSystemEditor` panel) in the Design-tokens workspace —
  the curated controls + live palette; reuses `setThemeTokenOverride` / `setThemeComponentOverride` and the
  existing palette reload signal.
- **VortSpec core**: a semantic-lever → token map (per source/library) + resolver, alongside the existing
  overlay + token-theme-key plumbing. Deterministic; no AI in the edit path.
- **Scope**: consumed libraries first (the immediate need); the editor + map generalize to built/Figma
  design systems later.
- **Constraint preserved**: consume sources never have their real token file mutated — every lever writes to
  the VortSpec-owned overlay, resolved on top at preview/build (already enforced).
