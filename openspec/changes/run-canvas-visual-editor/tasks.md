## 1. Webview embed + bridge foundation

- [x] 1.1 Enable `webviewTag: true` in the IDE window `webPreferences` (`apps/ide/src/main/index.ts`); confirm cockpit is unaffected.
- [x] 1.2 Add a guest-preload build input to electron-vite (`apps/ide/electron.vite.config.*`) that emits an isolated `inspector-bridge` preload bundle.
- [x] 1.3 Define the zod-typed host⇄guest protocol in `packages/core/src/shared/inspector-bridge.ts` (commands `requestTree`/`selectNode`/`hoverNode`/`applyOverride`/`clearOverride`, events `ready`/`tree`/`readout`/`geometry`) + the `Selection` view-model, with unit tests for schema round-trips (`inspector-bridge.test.ts`).
- [x] 1.4 Implement the guest side in the preload: build the node tree, `getBoundingClientRect`, computed box-model/style read, and a MutationObserver/scroll/resize emitter for geometry updates. Attach defensively (no-op + notice on failure/CSP).
- [x] 1.5 Add a `RunCanvas` webview host in `packages/ui` that loads the resolved dev URL and wires a `useInspectorBridge` hook over `webview.send`/`ipc-message`.

## 2. Canvas surface, overlay, and handles (run-canvas)

- [x] 2.1 Replace the plain `<iframe>` in `RunApp.tsx` (app kind) with `RunCanvas`, behind a feature flag that falls back to the iframe; keep start/loading/no-server states.
- [x] 2.2 Implement pan/zoom: a single CSS transform wraps the webview + overlay (overlay inside the stage → guest rects map 1:1 at any zoom); zoom −/100%/+ + reset control and a Pan mode (drag-to-pan catcher, reliable since the webview isolates wheel/keys); handle-drag deltas divided by zoom.
- [x] 2.3 Draw the hover highlight (dimensions label) and the selection bounding box in the overlay, kept aligned via `geometry`/`hovered` events; canvas hover/click driven by an Inspect/Interact mode toggle in the guest.
- [x] 2.4 Render resize handles (corners/edges) and spacing handles (padding/margin edges) on the selected element.
- [x] 2.5 Non-blocking "visual editing unavailable" notice when the bridge fails to attach; canvas still shows the interactive app.

## 3. Node-tree sidebar (run-canvas)

- [x] 3.1 Build a `NodeTree` component reusing the Explorer flat-map + `Set` expand + depth-padded render pattern, fed by `treeUpdate`.
- [x] 3.2 In the Run activity the left sidebar is the Design panel (Layers tree + property sections), a resizable rail in the Explorer's position (the file Explorer aside is hidden for work activities); switching to another activity restores the file Explorer.
- [x] 3.3 Wire tree ↔ canvas cross-selection (select node → highlight element; click element on canvas → readout selects + highlights its node). (Auto-expand/scroll-to-reveal a collapsed node is deferred.)

## 4. Element → component → token resolution (preview-inspector-bridge)

- [x] 4.1 Add a host-side resolver that inverts `token-parser` (`resolve()`/`buildUsage()`) to name the tokens whose values resolve into a selected element's computed style.
- [x] 4.2 Map a selected element to its source component via `data-component`/tag heuristics reusing `component-reader` (`compose.ts` `resolveComponent`), yielding the component name + variant controls. (Populating `previewUrl` and surfacing the Figma match is deferred.)
- [x] 4.3 Add the IPC channels + preload wrappers + `VortSpecApi` methods needed for token/component resolution (zod-validated in `ipcContract`).

## 5. Figma-style Design panel + ephemeral editing (visual-token-editing)

- [x] 5.1 Build the `DesignPanel` (left sidebar for the Run activity): a collapsible Layers/node-tree region on top and the selection's property sections below; typed `Selection` view-model the sections read from (`packages/ui/src/components/run-canvas/DesignPanel.tsx` + `NodeTree.tsx`).
- [x] 5.2 Implement the property sections in Figma order — Current variant, Position, Layout, Appearance, Stroke, Fill, Effects, Colors, Layout guide — as collapsible section components with Figma-shaped controls; each value shows current setting + token badge when token-backed; empty sections hidden. (Computed-style→section mapping is task 4.1.)
- [x] 5.3 Build the **Current variant** section: renders a dropdown per variant prop (enum/boolean/text) with current value + options, from `VariantControl`s (`PropControl` + current).
- [x] 5.4 Two-way binding: dragging a resize handle (e/s/se) updates width/height and the same live override + pending edit as editing the section field. (Spacing/padding-handle drag is deferred.)
- [x] 5.5 Apply changes (incl. variant switches) as ephemeral guest overrides (`applyOverride`/`clearOverride`) for instant feedback; clear on cancel, selection change, or reload.

## 6. Gated commit routing (visual-token-editing)

- [x] 6.1 Add an explicit "Apply changes" / "Discard" control that is the only path to disk; show a shared-token vs single-element warning before applying.
- [x] 6.2 Route token-backed value commits through `inspector:setTokenValue`; reload the preview so it reflects real files.
- [x] 6.3 Route non-token/structural commits — including **variant switches** — through a gated Claude Code run via `useAgentRun`, taking `snapshotComponent`/`snapshotTokenScope` first for revert; batch pending edits per apply.
- [x] 6.4 Discard drops all overrides and writes nothing; verify no file is touched before apply.

## 7. Tests & verification

- [x] 7.1 Vitest for the bridge protocol schemas and the element→token resolver (against fixture token files + computed-style samples).
- [x] 7.2 Playwright CT for the Run activity: the Design panel mounts beside the canvas, Layers empty-state, canvas "preparing" state (`run-canvas.ct.tsx`). (Overlay/cross-selection/bridge-failure via a mock bridge still to add.)
- [x] 7.3 CT for the edit flow via the mock API: ephemeral edit records no write; apply of a token value calls `setTokenValue`; structural apply triggers a gated run; discard writes nothing (assert via recorded `__fsOps`/`__runPrompts`).
- [~] 7.4 Verified: IDE `build` succeeds and emits `out/preload/guest.mjs`; core (196) + ui (17) unit + all IDE CT (64) pass; core/ui/ide-web typecheck clean; cockpit typecheck has only the pre-existing unrelated `?raw` error (unaffected by this change). Remaining: a manual PRD "Done when" end-to-end pass in the running IDE against a real dev server.
