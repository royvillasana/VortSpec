# Rich per-component Storybook documentation

## Why

Our Storybook stories use `tags: ['autodocs']`, which produces a thin page —
description + controls + stories only. A reference design-system component doc
(the user's workshop Card page, built from the *same* Figma file as their project)
shows a far richer, machine-facing page: Component Identity, Props, Common Patterns,
Anti-Patterns, States & Behaviour, Accessibility, Design Tokens (swatches), and an
**AI Generation Hints** block (keywords + generation rules), plus the stories. That
richness is exactly the SDD-DE AI hand-off philosophy, and most of the content
already exists in each component's Component Spec — it just never reaches Storybook.

## What Changes

- **New "Sync docs" action** in the Playground that generates rich per-component
  documentation pages in Storybook, matching the reference's 10 sections in order.
- **Shared doc blocks**: a reusable set of presentational components under
  `.storybook/doc-blocks/` (Identity, PropsTable with enum pills, Patterns,
  AntiPatterns, StatesTable, A11y, Tokens swatches, AIHints) so every component's
  docs page is consistent.
- **Per-component `<Component>.mdx`**: for each component lacking one, a docs page
  (`<Meta of={Stories} />` + the sections) that replaces thin autodocs. Data comes
  from the Component Spec + CVA/source + token map, enriched — when the source is
  Figma — by the `figma_generate_component_doc` MCP tool (the "metadata" tool:
  anatomy, per-variant tokens, content guidelines, design annotations, parity).
- **Additive + idempotent**: only components without an `.mdx` get one; existing
  stories/docs and component source are never touched. Re-run to complete.

Patched in the app prompt (per the user's direction), not the SDD-DE skills.

## Impact

- `views/DevPreview.tsx`: new `DOCS_PROMPT`, `generateDocs()`, a "Sync docs" button,
  and a sync-mode overlay label.
- No schema/IPC changes. Claude Code executes the generation; the doc blocks + MDX
  live in the user's project. No SDD-DE skill edits.
