## Why

The VortSpec IDE shell reads as a rough approximation of VS Code, not the real thing: the Explorer sidebar is always present even on full-screen panels, files have no type icons, the terminal is a separate bottom strip rather than a tabbed panel, regions can't be moved or closed the way VS Code lets you, there's no Settings or Source-Control view, and the editor's word-wrap doesn't reliably reflow when regions are resized. The user has explicitly said they are not pleased with the current experience and want a faithful, VS Code–grade workbench.

## What Changes

- **Movable, dockable, closeable regions.** The workbench becomes a set of regions the user arranges: a primary sidebar (left), a secondary sidebar (right, the assistant), the editor group (center), and a **panel group** (bottom or side) that holds the **Terminal** (as a tab, extensible to more panels). Each region can be **collapsed, closed, and reopened**; the panel group can be **moved between the bottom and the side**; the editor can be closed so only the panel group remains. Layout persists.
- **Terminal as a panel tab.** The integrated terminal moves into the panel group as a tab (open a new terminal, close it, reopen later), instead of the current separate bottom strip.
- **Preview becomes a slim nav bar (external browser), not an embedded pane.** The embedded preview iframe is replaced by a thin **preview bar pinned to the bottom of the editor**: a "Preview" label, the App / Storybook selector, and an **Open Browser** action (opens the running dev server's localhost URL in the user's external browser) in place of the old "Start" button. A **collapse arrow** next to it expands the bar to show the **local-environment details** — the localhost address, server state, and the triggered script/port. The bar is **collapsed by default**, keeps the current dark background, and is **shown only while the editor group is on screen** (hidden when the editor is closed).
- **The activity bar is the single navigation; the reused panels lose their internal rail.** The shared cockpit panels currently render their own left `ProjectRail` (Flow, Run, Play, Tokens, Manifest, Source Control, History). In the IDE that rail is **removed** — the panels render chromeless — and its destinations move onto the IDE **activity bar** as icons: Flow/Pipeline, Run, Playground, Tokens, Manifest, Source Control, History (alongside Explorer and Settings). Every activity-bar icon SHALL carry a **hover tooltip** label (the icons are unlabeled).
- **Activity-conditional primary sidebar.** The Explorer left sidebar is shown for the code/folder view and **hidden for panel activities** (Pipeline/Playground/Tokens/Tasks/Manifest/Source). On the Playground / design-flow views, only the assistant (right) sidebar is available, and only if the user opens it.
- **VS Code sidebar views.** The primary sidebar hosts distinct views the activity bar switches between: **Explorer** (with **full-color per-file-type icons** — distinct color + glyph per type, like a VS Code icon-theme extension), **Source Control** (GitHub/SCM connection, VS Code–style; also where project/product configuration lives), and **Settings** (scoped to the **user profile**).
- **Animated sidebar open/close.** Collapsing/expanding the left and right sidebars animates, reusing the cockpit app's animation approach.
- **Deterministic editor reflow.** Monaco word-wrap re-computes on every region resize, in both directions (grow and shrink), so wrapped text never goes stale or overlaps.
- Removes the always-present persistent Explorer and the separate fixed terminal strip in favor of the above. **BREAKING** for the IDE shell layout only (no cockpit impact; no core/IPC contract changes required beyond what already exists).

## Capabilities

### New Capabilities
- `ide-workbench-layout`: the movable/dockable region model — primary sidebar, editor group, bottom/side panel group (Terminal tab, extensible), secondary sidebar; collapse/close/reopen each region; move the panel group between bottom and side; close the editor to leave only the panel group; persisted layout; activity-conditional primary-sidebar visibility.
- `ide-preview-bar`: the slim preview nav bar at the bottom of the editor — App/Storybook selector, Open Browser (opens the dev server's localhost URL externally), and a collapse/expand arrow revealing local-environment details (localhost address, server state, script/port); collapsed by default, dark background.
- `ide-sidebar-views`: the activity bar as the single navigation (with hover tooltips on every icon) plus the primary-sidebar view set — Explorer with full-color per-file-type icons, Source Control (GitHub/SCM + product configuration) VS Code–style, and Settings (user profile). The reused cockpit panels render chromeless (no internal ProjectRail) in the IDE.
- `ide-editor-reflow`: deterministic Monaco word-wrap/relayout on every container size change (sidebar drag, panel toggle, window resize), both directions.

### Modified Capabilities
<!-- The IDE shell/terminal/preview specs live in the unarchived `vortspec-ide` change, not yet in openspec/specs/, so their behavior changes are captured as the new capabilities above rather than as delta specs. -->

## Impact

- **apps/ide** renderer: a new layout engine (region model + docking + persistence) replacing the current fixed shell in `App.tsx`; `ActivityBar` gains Flow/Pipeline, Run, Playground, Tokens, Manifest, Source Control, History, and Settings entries — each with a hover tooltip — and becomes the single navigation; `Explorer` gains full-color file-type icons; a new **panel group** with a Terminal tab (reusing `Terminal`); a new **preview nav bar** shown only with the editor (App/Storybook select, Open Browser via the external-open handler, expandable env details) replacing the embedded `PreviewPane`; a Settings (profile) view; a Source Control view; animated sidebar transitions.
- **@vortspec/ui**: reuse `AssistantDock`, `SourceControl`, and the shared panels — add a `chromeless`/`hideRail` prop to the panels that render `ProjectRail` (Inspector, GuidedFlow, Tasks, DesignManifest, DevPreview/Playground, SourceControl, History, RunApp) so the IDE can suppress the internal rail while the cockpit keeps it; possibly a small shared animation/transition helper.
- **@vortspec/core**: no new IPC expected — reuses existing `terminal:*`, dev-server, git, workspace, and profile/settings handlers. Confirm during design.
- **Tests**: new Playwright CT for docking/close/reopen, tab switching, activity-conditional visibility, file icons, and reflow; keep cockpit CT + all vitest green.
- No cockpit (`apps/desktop`) behavior changes.
