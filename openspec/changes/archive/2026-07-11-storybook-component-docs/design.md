# Design — Rich per-component Storybook docs

## Reference sections (locked)

From the user's Card reference (same Figma file as the project), in order:
1. Live preview (+ show/copy code) · 2. Component Identity (Category, Type, Import,
Figma file, Figma node) · 3. Props (enum values as pills) · 4. Common Patterns
(named recipes + code) · 5. Anti-Patterns (Why / Instead) · 6. States & Behaviour ·
7. Accessibility (ARIA/Keyboard/Screen-reader/WCAG + notes) · 8. Design Tokens
(swatches + radius/shadow) · 9. AI Generation Hints (use-cases + Keywords + Rules) ·
10. Stories.

## Approach (app prompt)

A new `DOCS_PROMPT` drives Claude Code to:
1. **Build shared doc blocks** under `.storybook/doc-blocks/` once (Identity,
   PropsTable, Patterns, AntiPatterns, StatesTable, A11y, Tokens, AIHints + barrel)
   so every page is consistent and matches the reference styling.
2. **Gather per-component data** from the Component Spec + `*.variants.ts`/source +
   the token map, and — for Figma sources — `figma_generate_component_doc(nodeId,
   codeInfo)` for the design-derived sections. Compose the curated sections
   (Patterns, Anti-Patterns, AI Hints).
3. **Write `<Component>.mdx`** (`<Meta of={Stories} />` + the sections in order),
   which Storybook 8 auto-attaches as that component's docs page, replacing autodocs.

Additive/idempotent (only-missing), matching the existing "Sync stories" ethos, so
it survives partial runs and completes on re-run.

## Why a separate "Sync docs" action

Docs generation is heavier than stories (Figma calls + MDX per component), and docs
depend on stories existing. Keeping it a distinct action gives the user control over
when to spend it and keeps each prompt focused; both share the one Storybook run
hook (a `syncMode` state labels the overlay).

## Why doc blocks (not plain markdown)

The reference renders styled artifacts — enum pills, color swatches, red anti-pattern
cards, a hint box. Plain MDX markdown can't match that; small reusable React doc
blocks give consistent, reference-grade output across all components.

## Invariants

Claude Code generates everything; the blocks/MDX live in the user's project;
Figma read-only; no SDD-DE skill edits; additive and non-destructive.
