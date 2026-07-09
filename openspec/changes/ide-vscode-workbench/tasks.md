# Tasks — IDE VS Code workbench

Ordered by dependency and shippability. Each group ends with `pnpm build && pnpm test && pnpm lint` green and, where it changes the shell, a check in the running IDE. Renderer-only; `@vortspec/core` and the cockpit stay untouched.

## 1. Editor reflow (small, independent, ship first)

- [x] 1.1 In `CodeEditor`/`DiffView`, observe the stable outer editor region (not Monaco's own host) with a `ResizeObserver` and call `editor.layout({ width, height })` with the measured content-box size; keep `automaticLayout:false`, `wordWrap:"on"`.
- [x] 1.2 Add a `layoutVersion` signal (bumped on region open/close/dock/show) that forces an `editor.layout()` even when the container size didn't change (e.g. editor un-hidden).
- [x] 1.3 CT: resize a neighboring region back and forth and assert the editor stays wrapped-to-width both directions (no stale/overlap); diff view re-wraps too.
- [x] 1.4 Gate green; verify in the running IDE that dragging the assistant wide→narrow→wide re-wraps every time.

## 2. Full-color file-type icons in the Explorer

- [x] 2.1 Add `fileIcon(name, { isDir, open })` returning an inline, bundled, **full-color** SVG (distinct color + glyph per type) for common types (ts/tsx, react, js/jsx, json, md, css/scss, html, yaml, images, lockfiles, git/dotfiles, folder open/closed) with a generic fallback — curated from a permissively-licensed icon family, no network.
- [x] 2.2 Render the icon before each Explorer entry; folder icon reflects open/closed state.
- [x] 2.3 CT: `App.tsx`, `tokens.css`, `package.json` each render a distinct full-color icon (different glyph/color, not one generic icon); a folder shows open vs closed icons on expand/collapse.
- [x] 2.4 Gate green.

## 3. Layout store (region model + persistence)

- [x] 3.1 Create a layout store (reducer + `usePersistentLayout`) describing: primary-sidebar view + open/width, secondary-sidebar open/width, editor-group open, panel-group open/dock(`bottom|right`)/size/openTabs/selectedTab.
- [x] 3.2 Extend the window-aware clamping into the store: clamp sizes on load and on window resize so the editor keeps a minimum and nothing overflows; persist to `localStorage`.
- [x] 3.3 Unit-test the reducer (open/close/reopen each region, move panel bottom↔side, clamp on small window, restore).

## 4. Tabbed panel group (Terminal)

- [x] 4.1 Build a `PanelGroup` that renders tabs and shows the selected content; open tabs stay mounted-but-hidden on switch (terminal session preserved).
- [x] 4.2 Move `Terminal` into the panel group as a tab; closing a tab unmounts it (kills the session), reopening creates a fresh instance.
- [x] 4.3 Support docking the panel group at the **bottom** (below the editor) or the **side** (beside the editor), preserving tabs/selection; draggable divider for its size.
- [x] 4.4 CT: switch tabs without killing the terminal session; close+reopen a terminal; move panel bottom↔side.

## 4b. Preview nav bar (external browser)

- [x] 4b.1 Build a `PreviewBar` pinned to the bottom of the editor group (rendered only while the editor group is on screen): single collapsed row with "Preview" label, App/Storybook selector, and (far right) an Open Browser action + a collapse/expand arrow; dark background; collapsed by default. Replaces the embedded `PreviewPane`.
- [x] 4b.2 Open Browser: start the selected dev server if not running (reuse `startAppServer`/`appServerStatus`, `startDevServer`/`devServerStatus`), then open its localhost URL in the external browser via the existing open-external handler; no iframe. Errors render as a human message.
- [x] 4b.3 Expand arrow reveals an env-details strip: localhost URL, server state (running/starting/stopped), script, and port for the selected target; collapses back on re-click; persist the expanded/target state.
- [x] 4b.4 CT: bar renders collapsed by default with the App/Storybook selector + Open Browser; expanding shows the localhost URL + state; Open Browser calls start (when stopped) and the external-open handler; remove/retire the embedded preview pane and its CT.

## 5. Single-navigation activity bar + chromeless panels + sidebar views

- [x] 5.1 Add a `hideRail`/`chromeless` prop to the shared panels that render `ProjectRail` (`Inspector`, `GuidedFlow`, `Tasks`, `DesignManifest`, `DevPreview`/Playground, `SourceControl`, `History`, `RunApp`) — suppresses the internal rail when set; cockpit omits it (rail unchanged). Keep cockpit CT green.
- [x] 5.2 Expand the IDE `ActivityBar` to the single navigation: sidebar views (Explorer, Source Control, Settings) + working-area activities (Flow/Pipeline, Run, Playground, Tokens, Manifest, History), each with a **hover tooltip** (`title` + `aria-label`).
- [x] 5.3 Render the primary sidebar only for a sidebar-view activity; working-area activities hide it and show the chromeless panel. Re-clicking the active sidebar activity toggles the primary sidebar.
- [x] 5.4 Source Control view: embed the chromeless `@vortspec/ui/SourceControl` (GitHub connect/auth + product configuration reachable, VS Code-style).
- [x] 5.5 Settings view: a small view scoped to the **user profile** over `profile:get/save` (no new IPC; project config is NOT here).
- [x] 5.6 CT: switching to a working-area activity hides the Explorer and renders the panel WITHOUT its ProjectRail; switching back restores the Explorer; hover tooltips present; Source Control + Settings reachable from the activity bar.

## 6. Assemble the workbench + animations

- [x] 6.1 Swap `App.tsx` to render all regions from the layout store (primary sidebar, editor group, panel group, secondary sidebar), replacing the fixed shell and the old bottom terminal strip.
- [x] 6.2 Animate primary/secondary sidebar collapse/expand with a CSS transition matching the cockpit; disable the transition during drag, enable it for toggle.
- [x] 6.3 Wire close/reopen controls (status bar + activity bar): close the editor to leave only the panel group; reopen restores tabs. Ensure `layoutVersion` bumps drive editor reflow on show/dock.
- [x] 6.4 On the Playground / design-flow view, show only the assistant sidebar if the user opens it (closeable/reopenable); Explorer stays hidden.
- [x] 6.5 CT: end-to-end — open workspace, hide Explorer via a panel, open the Terminal panel + use the preview bar's Open Browser, dock the panel to the side, close the editor (panel-only), close+reopen the assistant, animations present.

## 7. Verification & gate

- [x] 7.1 Remove dead code (old terminal strip, persistent-Explorer paths, unused helpers); confirm no cockpit regressions (desktop CT green).
- [x] 7.2 Full gate: `pnpm build && pnpm test && pnpm lint` green across all packages; IDE CT covers reflow, icons, the terminal panel + docking, the preview bar (Open Browser + env details), close/reopen, and activity-conditional visibility.
- [ ] 7.3 End-to-end validation in the running IDE against the real test workspace; confirm every user requirement is met (reflow, icons, hide-Explorer-on-panels, terminal panel, preview bar + Open Browser + env details, movable/closeable regions, Settings, Source Control, animations).
