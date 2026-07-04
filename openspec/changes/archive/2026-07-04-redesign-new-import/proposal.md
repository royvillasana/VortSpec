## Why

The current New Import screen was built as a first pass during the initial implementation sprint. The user has now provided a refined design spec with clearer layout, better source card hierarchy, proper state variants (hover, attached, error), and a more polished design system accordion. Aligning the implementation to this spec brings the screen up to the same pixel-fidelity standard as the redesigned Projects Dashboard.

## What Changes

- Rewrite the `NewImport` component to match the refined design spec exactly
- Centered column layout, max 640px, page title "Import a design"
- Two side-by-side source option cards (bg/panel, radius/md, 24px padding):
  - **Card 1 "Upload a ZIP export"**: subtitle, dashed dropzone (120px tall, border/subtle dashed), states: default, hover (accent border), file attached (filename chip with remove x), error ("#E5484D" message below dropzone)
  - **Card 2 "Connect Figma"**: subtitle, secondary-style "Connect Figma" button (bg/raised, border/strong), muted helper text
- Collapsed "Attach a design system (optional)" section with rotating chevron; expanded shows smaller dropzone for tokens.json/CSS/ZIP with helper text about token matching
- "Start import" primary button (bottom right), disabled until a source is provided, navigates to import progress on click
- All interactive state variants: dropzone drag-over, file chip, error message, accordion expand/collapse

## Capabilities

### New Capabilities
<!-- None - this is a refinement of existing capability -->

### Modified Capabilities
- `import-flow`: Refined visual design and interaction states for the New Import screen. Updated layout to centered 640px column, updated card structure with proper subtitles, added explicit dropzone state variants (hover/attached/error), replaced Figma URL input with secondary button pattern, and refined the design system accordion.

## Impact

- **Modified code:** `src/components/import/NewImport.tsx` — full rewrite
- **No new dependencies**
- **No API changes** — purely a UI refinement
- **Route unchanged:** `/projects/[id]/import`
