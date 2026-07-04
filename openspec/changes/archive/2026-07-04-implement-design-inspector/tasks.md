## 1. Project Scaffolding & Foundation

- [x] 1.1 Initialize Next.js App Router project in `apps/web` with TypeScript strict, Tailwind CSS, and shadcn/ui
- [x] 1.2 Configure Tailwind with VortSpec design tokens as CSS custom properties (all colors, typography, spacing from the prototypes)
- [x] 1.3 Add Geist and Geist Mono font families via Google Fonts
- [x] 1.4 Set up global dark theme styles (background, scrollbar, box-sizing reset, toast animation keyframes)
- [x] 1.5 Install dependencies: `@xyflow/react`, `elkjs`, `next-intl`
- [x] 1.6 Set up i18n layer with `next-intl` and initial `en.json` messages file
- [x] 1.7 Create TypeScript IR type stubs in `types/ir.ts` matching PRD section 10 data model shapes
- [x] 1.8 Create mock data layer in `lib/mock-data/` with tokens (48), components (5), issues (31), patches fixtures

## 2. App Shell & Layout

- [x] 2.1 Create root layout with dark theme, font loading, and global styles
- [x] 2.2 Build the `InspectorLayout` component: 220px left nav rail + flexible main area + 48px chat strip
- [x] 2.3 Build `NavRail` component with project header (initial badge, name, version/token count)
- [x] 2.4 Build `NavItem` component with icon, label, active state styling, and hover effects
- [x] 2.5 Add nav links for Tokens, Components, Graph, Issues, History with correct SVG icons from prototypes
- [x] 2.6 Build Issues badge count component (amber pill with Geist Mono)
- [x] 2.7 Build Settings link at nav bottom with gear icon
- [x] 2.8 Build `ChatStrip` component (48px bar with chat bubble icon button)
- [x] 2.9 Set up Next.js route structure: `/projects`, `/projects/[id]/import`, `/projects/[id]/inspect/(tokens|components|graph|issues|history)`

## 3. Projects Dashboard

- [x] 3.1 Build Projects Dashboard page at `/projects` with grid layout
- [x] 3.2 Build `ProjectCard` component with name, timestamp, token/component counts, status
- [x] 3.3 Build "New project" creation flow (modal or inline form for project name)
- [x] 3.4 Build empty state for zero projects
- [x] 3.5 Wire project card clicks to navigate to `/projects/[id]/inspect/tokens`

## 4. Import Flow

- [x] 4.1 Build New Import page at `/projects/[id]/import` with upload zone and Figma URL input
- [x] 4.2 Build drag-and-drop ZIP upload zone with visual feedback (border highlight, accept/reject states)
- [x] 4.3 Build file validation (ZIP type, 50MB limit) with human-readable error messages
- [x] 4.4 Build Figma URL input with format validation
- [x] 4.5 Build companion design system attachment section (optional tokens JSON/CSS upload)
- [x] 4.6 Build Import Progress page at `/projects/[id]/import/[importId]`
- [x] 4.7 Build pipeline stage tracker with 6 stages: Parse, Style Mining, Token Inference, Structure Inference, DS Merge, Report
- [x] 4.8 Build per-stage status indicators: queued (gray), running (animated blue), done (green check), failed (red + error)
- [x] 4.9 Build retry button for failed stages
- [x] 4.10 Build "View in Inspector" navigation button on completion

## 5. Inspector - Tokens Panel

- [x] 5.1 Build Tokens page with grouped token collections (Color, Typography, Spacing, Radius, Shadow)
- [x] 5.2 Build group headers with type name, count, and collapse toggle
- [x] 5.3 Build `TokenRow` component: visual preview (swatch/glyph/bar/corner), name, value, provenance dot, usage count
- [x] 5.4 Build search/filter input for real-time token filtering by name or value
- [x] 5.5 Build token detail side panel: value editor (color picker for colors, text input for others)
- [x] 5.6 Build alias controls in token detail
- [x] 5.7 Build "where used" listing in token detail with hover highlight on component previews
- [x] 5.8 Build token rename action with live preview across usages
- [x] 5.9 Build token merge action with reference rewrite preview
- [x] 5.10 Build token delete action with fallback strategy selector (inline as flagged literal / remap)
- [x] 5.11 Build "Promote to token" action for flagged literals

## 6. Inspector - Components Panel

- [x] 6.1 Build Components list page with card grid layout
- [x] 6.2 Build `ComponentCard` with name, preview thumbnail, variant count, completeness score (color-coded), status chip
- [x] 6.3 Build Component Detail page at `/projects/[id]/inspect/components/[componentId]`
- [x] 6.4 Build Playground section: variant segmented control, live IR preview area, inline token list
- [x] 6.5 Build prop controls from ControlHint metadata (text input, color picker, toggle, select)
- [x] 6.6 Build CHECKS row: variant render coverage, contrast ratio, hit target size, focus state presence
- [x] 6.7 Build variant matrix grid rendering all variant combinations
- [x] 6.8 Build props table display
- [x] 6.9 Build structure tree view
- [x] 6.10 Build component rename action
- [x] 6.11 Build variant axis edit/confirm actions with provenance badges
- [x] 6.12 Build component approval flow (block on errors, confirm dialog for warnings)
- [x] 6.13 Build inferred item one-click confirm buttons

## 7. Inspector - Graph View

- [x] 7.1 Build Graph page with React Flow canvas, dot-grid background, and zoom controls
- [x] 7.2 Build lens switcher (Component / Token segmented control)
- [x] 7.3 Build component selector dropdown for Component lens
- [x] 7.4 Build custom `TokenNode` React Flow node: type icon, name, value, provenance dot, output socket
- [x] 7.5 Build custom `ComponentNode` React Flow node: variant selector, preview area, input handles with labels, name/score/open-link
- [x] 7.6 Build bezier edge rendering with token-type coloring and cubic control points matching prototype's `bez()` function
- [x] 7.7 Implement edge rewiring drag interaction: dashed purple edge following cursor, compatible target glow, incompatible target dimming
- [x] 7.8 Implement type-compatible connection validation (color-to-color only, radius-to-radius only, etc.)
- [x] 7.9 Implement incompatible drop rejection with shake animation and tooltip
- [x] 7.10 Implement edge disconnect creating flagged literal with amber chip and "Promote to token" action
- [x] 7.11 Build Token lens: central token node with glow ring, usage count
- [x] 7.12 Build custom `ThumbnailNode` for Token lens: mini preview, component name, property label, score badge
- [x] 7.13 Build Token lens edge fan-out from central token to component thumbnails
- [x] 7.14 Build Token lens detail panel (right side): token name, color picker + hex input, provenance info, ripple description
- [x] 7.15 Implement Token lens live edit ripple: value change updates all thumbnails with edge highlight animation
- [x] 7.16 Build zoom controls: +/- buttons, percentage display, "Fit view" button (range 50%-150%)
- [x] 7.17 Build toast notification system: slide-up animation, green check, Geist Mono message, 3s auto-dismiss
- [x] 7.18 Wire all graph mutations to IRPatch semantics with version tracking

## 8. Inspector - Issues Panel

- [x] 8.1 Build Issues page with scrollable issue list
- [x] 8.2 Build issue row: severity icon (colored diamond/circle), title, component name, kind badge, timestamp
- [x] 8.3 Build filter controls: severity toggles (Error/Warning/Info)
- [x] 8.4 Build filter controls: kind dropdown
- [x] 8.5 Build filter controls: component dropdown
- [x] 8.6 Build issue count summary header with severity breakdown
- [x] 8.7 Build deep link navigation from issue to target token/component
- [x] 8.8 Build one-click suggested action button with patch preview

## 9. Inspector - History Panel

- [x] 9.1 Build History page with vertical timeline layout
- [x] 9.2 Build history entry: summary, author icon (user/LLM), timestamp, operation type, version transition
- [x] 9.3 Build patch detail expansion (click to expand before/after values)
- [x] 9.4 Build linear undo: "Undo" button on most recent entry, revert on click
- [x] 9.5 Build LLM-authored patch approval status display

## 10. Inspector - Assistant (Chat Drawer)

- [x] 10.1 Build `AssistantDrawer` component: 400px slide-out from right, overlay on main content
- [x] 10.2 Build chat message history with user (right-aligned) and assistant (left-aligned) message bubbles
- [x] 10.3 Build text input at drawer bottom with send button
- [x] 10.4 Build IRPatch diff preview rendering: per-operation before/after, affected counts
- [x] 10.5 Build Approve/Reject buttons on proposed patches
- [x] 10.6 Wire approve to Zod validation + atomic apply + version increment
- [x] 10.7 Build clarification question rendering for ambiguous commands
- [x] 10.8 Integrate chat strip toggle to open/close the drawer

## 11. Shared UI Components

- [x] 11.1 Build `ProvenanceDot` component (7px circle: confirmed=green, inferred=amber, pending=gray)
- [x] 11.2 Build `TokenSwatch` component (18x18px type-specific preview: color swatch, Ag glyph, spacing bar, radius corner)
- [x] 11.3 Build `StatusChip` component (imported/normalized/approved with appropriate colors)
- [x] 11.4 Build `CompletenessScore` badge (Geist Mono, colored by threshold: green>=80, amber>=60, red<60)
- [x] 11.5 Build `Toast` notification component with slide-up animation and auto-dismiss
- [x] 11.6 Build `SegmentedControl` component for variant selectors and lens switchers
- [x] 11.7 Build `SeverityIcon` component (error red diamond, warning amber diamond, info blue circle)

## 12. Integration & Polish

- [x] 12.1 Wire all mock data through async service functions matching future API interface
- [x] 12.2 Ensure all user-facing strings go through i18n `useTranslations()` hook
- [x] 12.3 Add keyboard shortcuts: Cmd+Z for undo in History, Escape to close chat drawer
- [x] 12.4 Verify pixel fidelity against prototype designs for all 8 screens
- [x] 12.5 Test all interactive flows: token editing, edge rewiring, patch approval, component approval
- [x] 12.6 Performance check: Graph view at 50 token nodes + 12 thumbnails at 60fps
