## Context

The `NewImport` component at `src/components/import/NewImport.tsx` currently implements the import screen with a functional but rough layout. The user has provided a precise visual spec. This is a single-component rewrite — no architectural changes, no new packages, no routing updates.

## Goals / Non-Goals

**Goals:**
- Pixel-match the user's design spec for the New Import screen
- Implement all interactive state variants: dropzone default/hover/attached/error, accordion expand/collapse, button disabled/enabled
- Keep the component self-contained with local state (no external data deps for the UI shell)

**Non-Goals:**
- Actual file upload to Supabase Storage (mock/simulate for now)
- Figma OAuth flow (button is visual only)
- Backend import job creation

## Decisions

### 1. Single client component with internal state

The component manages: `file` (attached file info or null), `dragOver` (boolean), `error` (string or null), `dsExpanded` (boolean), `dsFile` (attached DS file or null). No external state management needed.

**Rationale:** All state is ephemeral and local to this screen. The "Start import" click navigates away via `router.push`.

### 2. Design token usage from existing CSS variables

All colors, borders, and radii use the existing `vs-*` Tailwind classes already defined in `globals.css`. No new tokens needed.

- bg/panel = `bg-vs-bg-surface`
- border/subtle = `border-vs-border-default` (dashed variant via `border-dashed`)
- bg/raised = `bg-vs-bg-elevated`
- border/strong = `border-vs-border-strong`
- text/muted = `text-vs-text-muted`
- radius/md = `rounded-lg` (8px)
- accent border on hover = `border-vs-accent`
- error text = `text-vs-error` (#E5484D)

### 3. Dropzone interaction via native drag events

Use `onDragOver`, `onDragLeave`, `onDrop` on the dropzone div. Click triggers a hidden `<input type="file" accept=".zip">`. File validation checks: must be `.zip`, must be under 50MB. Invalid files set the error state.

## Risks / Trade-offs

- **No real file handling** → Acceptable for Phase 1 frontend. The `file` state stores name + size for display; actual upload is a future backend integration point.
