## Context

The IDE (`apps/ide`) today has a fixed shell: an activity bar, a persistent Explorer left sidebar, a center that swaps between the editor and full-screen panels, a right `AssistantDock`, a separate bottom terminal strip, and window-aware-clamped resizers. It reads as an approximation of VS Code but diverges in ways the user cares about: the Explorer never hides, files have no icons, the terminal isn't a panel tab, regions can't be moved/closed/reopened, there's no Settings or Source-Control sidebar view, sidebar toggles don't animate, and Monaco's word-wrap goes stale on repeated resizes.

Everything is driven by `@vortspec/core` IPC (shared with the cockpit) and reuses `@vortspec/ui` panels. Constraints: reuse core + ui, don't break the cockpit (`apps/desktop`), keep Playwright CT + vitest green. The existing building blocks — `Explorer`, `EditorArea`/`EditorGroup`, `PreviewPane`, `Terminal`, `AssistantDock`, `SourceControl`, `Resizer`/`usePersistentNumber`, window-aware clamping, `useWorkspaceFiles` — are the raw materials.

## Goals / Non-Goals

**Goals:**
- A bounded but faithful VS Code region model: primary sidebar, editor group, a bottom/side **panel group** with Preview + Terminal **tabs**, and a secondary sidebar — each collapsible, closeable, and reopenable; layout persisted.
- The Explorer primary sidebar hides for panel activities; sidebar views (Explorer with file icons, Source Control, Settings) switch via the activity bar.
- Deterministic, both-directions editor reflow on any resize.
- Animated sidebar open/close matching the cockpit feel.

**Non-Goals:**
- Arbitrary drag-and-drop docking to any edge / split grids (VS Code's full golden-layout behavior). We support a **fixed set of dock slots** (panel: bottom or side; each region open/closed), not free-form docking.
- Detaching regions into separate OS windows.
- Redesigning the reused rich panels (Pipeline/Tokens/Tasks/Manifest) into narrow sidebar views — they stay full-center panels.
- New core/IPC contracts — reuse `terminal:*`, dev-server, git, workspace, and `profile:get/save` handlers.

## Decisions

### 1. A hand-rolled region model, not a docking library
Introduce a small layout store (a reducer + persisted state) describing region visibility, sizes, the panel-group dock (`"bottom" | "right"`), the selected panel tab, and which panel tabs are open. Render regions from this state.
- **Why over a lib** (rc-dock / flexlayout-react / golden-layout): those bring bundle weight, their own DOM/styling that fights our `vs-*` tokens, and far more capability than the bounded requirements need. A ~200-line model covers close/reopen/resize/dock-bottom-or-side with much less risk. We can graduate to a library later if free-form docking is ever required (tracked as an open question).

### 2. Panel group = tabbed container; contents stay mounted while open
The panel group renders tabs (Terminal now; extensible) and shows the selected one. Open tabs stay **mounted but hidden** (CSS) on switch, so switching between panels never kills the terminal session. **Closing** a tab unmounts it (kills the terminal); **reopening** creates a fresh instance.

### 2b. Preview is an external-browser nav bar, not an embedded pane
The embedded `PreviewPane` iframe is replaced by a slim **preview bar** pinned to the bottom of the editor group. Collapsed by default, it shows: "Preview" + the App/Storybook selector + an **Open Browser** action + an expand arrow. Open Browser starts the selected dev server if needed (reusing `startAppServer`/`appServerStatus` and `startDevServer`/`devServerStatus`) and opens its localhost URL via the existing external-open handler — **no iframe**. The expand arrow reveals a details strip (localhost URL, server state, script, port) from the dev-server status.
- **Why over the embedded iframe**: the user wants the preview to live in their real browser (dev-tools, real viewport) while the IDE stays code-focused; the bar keeps the dev-server controls and environment visibility without spending editor space on an iframe. This also removes the preview from the movable panel group, simplifying the panel model to just the Terminal.
- **Trade-off**: loses in-app live preview beside the code. Accepted per the user's explicit direction; the bar still makes starting/opening the server one click.

### 3. File-type icons: a bundled, offline, FULL-COLOR glyph set
Add a `fileIcon(name, { isDir, open })` helper returning an inline **full-color** SVG per type — distinct color *and* glyph (like a VS Code icon-theme extension) — for common types (ts/tsx, react, js/jsx, json, md, css/scss, html, yaml, images, lockfiles, git/config dotfiles) plus open/closed folder icons and a generic fallback.
- **Sourcing**: bundle a curated set of permissively-licensed (MIT/CC) colored SVGs — e.g. hand-picked from the `vscode-icons`/`material-icon-theme`/`seti` families — inlined as components, NOT the full asset packs. This satisfies the offline/CSP constraint (no network, no runtime asset fetch) while giving real color differentiation, and stays trivially extensible.
- **Why not the full theme packages**: hundreds of assets, bundle weight, and network/asset-loading assumptions the IDE's CSP forbids. A curated inlined subset covers the repo's real file types with full color.

### 4. The activity bar is the single navigation; panels render chromeless
Split activities into **sidebar views** (Explorer, Source Control, Settings) that render inside the primary sidebar, and **working-area panels** (Flow/Pipeline, Run, Playground, Tokens, Manifest, History) that take the center and **hide the primary sidebar**. Crucially, the reused cockpit panels currently render their own `ProjectRail` (Flow/Run/Play/Tokens/Manifest/Source Control/History) — in the IDE that rail is **removed** and its destinations become activity-bar icons. Implement via a `hideRail` (a.k.a. `chromeless`) prop on the shared panels (`Inspector`, `GuidedFlow`, `Tasks`, `DesignManifest`, `DevPreview`/Playground, `SourceControl`, `History`, `RunApp`): the IDE passes it to suppress `ProjectRail`; the cockpit omits it and keeps the rail. Re-clicking the active sidebar-view activity toggles the primary sidebar (VS Code behavior). Every activity icon carries a hover tooltip (native `title` + `aria-label`, upgraded to a styled tooltip if needed). This yields "hide the Explorer on panels", "one nav not two", and "only the assistant on the design flow."

### 5. Deterministic reflow: observe the region, lay out with explicit dims
The earlier attempt (`ResizeObserver` on Monaco's own host with `automaticLayout:false`) still went stale because Monaco mutates that node. Instead: observe the **stable outer editor region** and call `editor.layout({ width, height })` with the measured content-box size on every change, and also fire a layout on layout-store changes (open/close/dock) via a bumped `layoutVersion`. `wordWrap:"on"` then recomputes deterministically in both directions. Same treatment for `DiffView`.

### 6. Animated collapse/expand via CSS transitions
Sidebars animate `width` (with `overflow-hidden`) using a Tailwind transition (`transition-[width] duration-200 ease-out`), matching the cockpit's transition feel. The transition is **disabled during a drag** (so resizing is 1:1) and **enabled for toggle** open/close. Collapse animates width→0 then the region is treated as closed.

### 7. Persistence + window-aware clamping
Persist the layout store to `localStorage` (sizes, open flags, dock, selected tab). On load and on window resize, clamp sizes so the editor keeps a minimum and nothing overflows — extending the existing `winW`-based clamp into the store.

### 8. Sidebar views reuse existing surfaces
Source Control view embeds `@vortspec/ui/SourceControl` (chromeless) — it already has the GitHub connect/auth affordances and is the home for project/product configuration. Settings view is a new small view scoped to the **user profile** over `profile:get/save` — **not** project config — no new IPC.

### 9. The preview bar is bound to the editor group
The preview bar renders as the bottom chrome of the editor group, so it is shown only while the editor is on screen and disappears when the editor is closed or a full-screen panel is active (per the user).

## Risks / Trade-offs

- **Scope creep toward full docking** → Mitigate with the bounded slot model (Non-Goal #1); document the escape hatch (adopt a lib later).
- **Reused rich panels don't fit a narrow sidebar** → They stay full-center panels; only Explorer/Source-Control/Settings are true sidebar views. Consistent with the activity-conditional decision.
- **Monaco reflow edge cases** (very fast drags, hidden-then-shown editor) → Explicit `layout({w,h})` + a `layoutVersion` bump on show/dock; CT covers resize-both-directions and open/close.
- **Terminal / dev-server lifecycle on close** → Define close = terminate (kill terminal session / stop attach), reopen = fresh; make sure `stopAllTerminals` and dev-server stop paths are invoked so nothing leaks.
- **Regression risk to the running acceptance (I6.2)** → Build the region model incrementally behind the current shell, swap `App.tsx` last, keep every CT green at each step.
- **Big renderer refactor** → Isolate the layout store + region components; `@vortspec/core` and the cockpit are untouched.

## Migration Plan

1. Land the reflow fix (explicit-dims `layout`) and file icons first — small, independently shippable, no layout change.
2. Introduce the layout store + region components alongside the current shell; unit/CT them in isolation.
3. Add the Terminal panel group, the preview nav bar (App/Storybook + Open Browser + expandable env details), and the Source Control + Settings sidebar views.
4. Swap `App.tsx` to render from the store; wire activity-conditional visibility and animations.
5. Delete the old fixed terminal strip / persistent-Explorer paths. Full gate green; verify end-to-end in the running IDE.
- **Rollback**: the change is renderer-only and behind git; revert the `App.tsx` swap commit to return to the current shell.

## Resolved (user, this change)

- **Preview bar visibility**: shown only while the editor group is on screen; hidden when the editor is closed.
- **File icons**: full-color glyphs (distinct color + glyph per type), like a VS Code icon-theme extension — bundled/offline.
- **Settings scope**: user profile only. Project/product configuration lives in the Source Control view.
- **Activity-bar icons**: each needs a hover tooltip (they're unlabeled).
- **Navigation**: remove the reused panels' internal `ProjectRail`; the activity bar is the single navigation (Flow, Run, Play, Tokens, Manifest, Source Control, History move onto it).

## Open Questions

- Do we want free-form drag-to-dock (any edge, split grids) eventually, i.e. adopt a docking library — or is the bottom/side + close/reopen model sufficient? (Proposed: bounded model now.)
- File-icon coverage: which exact extensions ship in v1 (beyond the repo's current set), and which icon family do we curate from?
- Should closing the editor group be reachable from the UI directly, or only via a command/status-bar control?
