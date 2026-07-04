## Context

VortSpec is a greenfield Next.js monorepo (`apps/web`) building Phase 1: Ingestion + Normalization + Design Inspector. The design prototypes exist as Claude Design `.dc.html` files in `vortspec-design-inspector/project/`, providing pixel-perfect references for 8 screens. The PRD specifies the stack (Next.js App Router, Tailwind, shadcn/ui, React Flow, Supabase) and the CLAUDE-CODE-BRIEF.md defines working conventions (TypeScript strict, i18n layer, spec-first, no phase 2+ scope).

The IR schemas (`packages/ir`) and backend pipeline (`packages/pipeline`) are companion workstreams. This design covers the frontend UI implementation only, with data interfaces stubbed against the IR types.

## Goals / Non-Goals

**Goals:**
- Pixel-faithful implementation of all 8 design screens from the prototype bundle
- Shared app shell with persistent left nav, chat strip, and routing
- Component architecture that maps cleanly to the PRD's Inspector panels (Tokens, Components, Graph, Issues, History, Assistant)
- React Flow graph view with both component lens and token lens, supporting edge rewiring interactions
- All user-facing strings through an i18n layer from day one
- Mock data layer conforming to IR types so screens are demoable before backend completion
- Responsive to 1440px+ viewport (primary target from design specs), graceful at 1280px

**Non-Goals:**
- Code generation, execution sandbox, visual-verify (phase 2+)
- Screen Builder composition canvas (phase 3)
- Real Supabase integration, auth flows, RLS (separate workstream)
- Backend pipeline implementation
- Billing, multi-user collaboration
- Mobile/tablet responsive design (desktop-first for phase 1)

## Decisions

### 1. Route structure follows Inspector panels

```
/                           -> redirect to /projects
/projects                   -> Projects Dashboard
/projects/[id]/import       -> New Import
/projects/[id]/import/[importId] -> Import Progress
/projects/[id]/inspect      -> Inspector layout (shared shell)
  /tokens                   -> Tokens panel
  /components               -> Components list
  /components/[componentId] -> Component Detail + Playground
  /graph                    -> Graph view
  /issues                   -> Issues panel
  /history                  -> History panel
```

**Rationale:** Mirrors the left nav structure. The `/inspect` segment uses a nested layout for the shared left rail + chat strip, while each panel is a page within it. This avoids re-mounting the nav on section switches.

**Alternative considered:** Single-page with tab state in query params. Rejected because Next.js layouts give us free code-splitting per panel and shareable URLs.

### 2. Design token system via CSS custom properties + Tailwind

Extract the design's color palette, typography, and spacing into CSS custom properties consumed via Tailwind config:

```
--vs-bg-primary: #0B0C0E       (app background)
--vs-bg-surface: #141518       (panels, cards, nav)
--vs-bg-elevated: #1B1D21      (inputs, active states, previews)
--vs-border-default: #26282D   (standard borders)
--vs-border-strong: #34373D    (emphasized borders)
--vs-text-primary: #E7E9EC     (primary text)
--vs-text-secondary: #9BA1AB   (secondary text)
--vs-text-muted: #6B7280       (muted text, labels)
--vs-accent: #7C6FF0           (VortSpec purple, active nav, buttons)
--vs-success: #30A46C          (confirmed provenance, passing checks)
--vs-warning: #FFB224          (inferred provenance, warnings)
--vs-error: #E5484D            (errors)
--vs-info: #2563EB             (primary blue, component backgrounds)
```

**Rationale:** Single source of truth for the dark theme. When light theme lands later, only CSS variables change. Tailwind utilities reference variables via `theme.extend.colors`.

**Alternative considered:** Hardcoded Tailwind color classes. Rejected because the PRD mandates "tokens by reference, always" -- the product's own UI should practice what it preaches.

### 3. Graph view: @xyflow/react with elkjs auto-layout

The Graph view (PRD 7.6) uses `@xyflow/react` v12+ for the canvas with `elkjs` computing initial node positions. Custom node types:
- **TokenNode**: displays swatch/icon, mono name, value, provenance dot, output socket
- **ComponentNode**: displays live IR preview, variant selector, input handles with labels, flagged literal chips
- **ThumbnailNode** (token lens): mini component preview with name, property, score

Edge customization: colored by token type, bezier curves matching the prototype's `bez()` function, dashed edges for drag-in-progress state.

**Rationale:** React Flow is the PRD's specified choice. elkjs gives deterministic layouts without manual positioning. The prototype's `bez()` cubic bezier function maps directly to React Flow's `getBezierPath`.

### 4. Mock data layer with IR-shaped fixtures

Create `lib/mock-data/` with TypeScript fixtures conforming to IR types:
- `tokens.ts`: 48 tokens across color, typography, spacing, radius, shadow categories
- `components.ts`: Button, Input, Card, Modal, Badge components with variants and completeness scores
- `issues.ts`: 31 issues across severities and kinds
- `patches.ts`: Sample patch history entries

Each mock module exports async functions matching the future API interface, making the swap to real Supabase calls a drop-in replacement.

**Rationale:** Unblocks frontend development from backend. The PRD's "Meridian Design System" sample data from the prototypes provides realistic test content.

### 5. Component Playground renders via IR renderer stub

The Component Detail Playground (PRD 7.5, US-13) needs controls generated from component metadata. For Phase 1 frontend:
- Variant axes render as segmented controls
- Props render using ControlHint (text input, color picker, toggle, select)
- Preview renders an HTML/CSS representation derived from IR data (not executing user code)
- Checks row computed from IR metadata (variant coverage, contrast, hit target, focus state)

**Rationale:** The PRD explicitly states: "No sandbox, no user code execution, no iframe." The IR renderer is a pure function: IR + variant selection + prop values -> HTML/CSS string.

### 6. Chat drawer as a slide-out panel, not a page

The Assistant is a 400px-wide drawer that overlays from the right, keeping the current Inspector context visible. The chat strip (48px icon bar) is always visible; clicking it toggles the full drawer.

**Rationale:** The prototype shows the chat as a separate page, but the PRD specifies a "right-side chat drawer" (section 7.5) for conversational editing in context. The chat strip from the prototype provides the collapsed state.

## Risks / Trade-offs

- **IR schema not yet implemented** -> Mitigation: define TypeScript interfaces locally matching PRD section 10 schema shapes. Replace with `packages/ir` Zod inferred types once M0 completes. Use a `types/ir.ts` barrel that re-exports, so the swap is one-file.

- **React Flow performance with many nodes** -> Mitigation: PRD targets 50 token nodes + 12 component thumbnails at 60fps. React Flow handles this comfortably. Virtualize the token lens for larger datasets in future.

- **Prototype fidelity vs component reuse** -> Mitigation: extract shared components (NavItem, Badge, ProvenanceDot, TokenSwatch, StatusChip, CompletennessScore) into `components/ui/` alongside shadcn primitives. Prototype CSS values become design token variables.

- **i18n overhead for solo-founder** -> Mitigation: use `next-intl` with a single `en.json` messages file. All user-facing strings go through `useTranslations()`. Minimal overhead, PRD requires it.

- **Graph edge rewiring interaction complexity** -> Mitigation: React Flow's built-in connection/reconnection handlers cover most of the drag-to-rewire behavior. Type compatibility checks (color-to-color only) enforced in `isValidConnection` callback.
