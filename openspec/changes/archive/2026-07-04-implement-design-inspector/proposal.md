## Why

VortSpec Phase 1 requires a full Design Inspector UI so users can audit normalized design systems: browse tokens with provenance, inspect components with variant playgrounds, explore token-component wiring in a graph view, review issues, track history, and make conversational edits via chat. The Claude Design prototypes (`vortspec-design-inspector/project/`) provide pixel-perfect reference designs for all 8 screens. Building these screens is the core deliverable of Phase 1 -- without the Inspector, users have no way to interact with imported and normalized design data.

## What Changes

- Scaffold the Next.js App Router frontend (`apps/web`) with Tailwind, shadcn/ui, Geist font, and the dark theme from the designs
- Implement the **Projects Dashboard** screen: project cards with status, token/component counts, and create-project flow
- Implement the **New Import** screen: ZIP drag-and-drop upload and Figma URL/OAuth connection
- Implement the **Import Progress** screen: live pipeline stage tracking (parse, style mining, token inference, structure inference, DS merge, report) with per-stage status indicators
- Implement the **Inspector - Tokens** panel: token collections grouped by type, visual previews, provenance badges, usage counts, detail view with value editor and "where used" listing, and token operations (rename, merge, delete, promote)
- Implement the **Inspector - Components** panel: component cards with previews, completeness scores, status chips; detail view with variant Playground (metadata-driven controls, IR-computed checks), variant matrix, props table, structure tree
- Implement the **Inspector - Graph** view: React Flow canvas with component lens (token nodes, component node with input handles, bezier edge wiring, drag-to-rewire, flagged literal chips) and token lens (central token node, component thumbnail fan-out, live ripple on edit), zoom controls, lens switcher
- Implement the **Inspector - Issues** panel: filterable issue list by severity/kind/component with deep links and one-click suggested-action patches
- Implement the **Inspector - History** panel: patch history timeline with summary, author (user/LLM), timestamp, and linear undo
- Implement the **Inspector - Assistant** chat drawer: conversational editing with English/Spanish input, LLM-proposed IRPatch diffs rendered as visual before/after, approve/reject controls
- Implement the shared **left navigation rail** with project header, section links (Tokens, Components, Graph, Issues, History), settings, and chat strip
- All screens connected via Next.js App Router routing with shared layout

## Capabilities

### New Capabilities
- `app-shell`: Shared layout shell -- left nav rail, chat strip, project header, routing between Inspector sections
- `projects-dashboard`: Projects listing, creation, and selection
- `import-flow`: ZIP upload, Figma connection, and import progress tracking
- `inspector-tokens`: Token browsing, filtering, detail editing, and token operations (rename, merge, delete, promote)
- `inspector-components`: Component cards, detail view with Playground, variant matrix, props table, completeness checks
- `inspector-graph`: React Flow graph view with component lens and token lens, edge rewiring, flagged literal management
- `inspector-issues`: Issue list with filtering, deep links, and one-click patch actions
- `inspector-history`: Patch history timeline with undo
- `inspector-assistant`: Chat drawer for conversational editing with diff preview and approval

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **New code:** `apps/web/` -- Next.js application with ~20-30 React components, layout routes, and page routes
- **Dependencies:** Next.js 14+, Tailwind CSS, shadcn/ui, `@xyflow/react` (React Flow), `elkjs` (graph auto-layout), Geist font family
- **APIs consumed:** Will connect to backend IR store, pipeline jobs, and LLM provider (stubbed/mocked for initial UI build)
- **Design reference:** All screens pixel-matched to `vortspec-design-inspector/project/*.dc.html` prototypes
