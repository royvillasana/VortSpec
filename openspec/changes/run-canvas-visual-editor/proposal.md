## Why

Today the Run section shows the live app as an **opaque `<iframe>`** — you can look at your screens but you can't touch them. To change a spacing, a radius, or a token you leave the preview, hunt for the file, edit CSS by hand, and wait for reload. Designers who think spatially (Figma-style: select a thing, grab a handle, drag) have no way in. Tools like Noon prove the alternative — a canvas that operates *on the real product code and design system* rather than a static picture — and users want that here: select a rendered component, see every token that shapes it, and change padding / margin / radius / the token itself by direct manipulation, with the change flowing back to the project's files.

## What Changes

- The **Run activity becomes a hybrid browser + design canvas** ("Run Canvas"): the live dev-server app renders inside a pan/zoom canvas, still fully interactive, but now with a selection/hover overlay drawn on top.
- The live app is embedded in an **instrumented Electron `<webview>`** (replacing the opaque cross-origin `<iframe>`) with a **guest preload "inspector bridge"** that reads the rendered DOM without requiring any cooperation from the user's dev server. **BREAKING (internal):** the Run view's iframe embed is replaced by a webview; `webviewTag` is enabled on the IDE window.
- In the Run activity, the left sidebar switches from the file Explorer to a **Figma-style Design panel** (mirroring Figma's right-hand Design tab, but docked left where the Explorer lives). It has a collapsible **Layers / node tree** at the top (component / DOM nodes) and, below it, the property **sections for the current selection**.
- **Selecting a rendered element** highlights it on the canvas, shows resize/spacing **handles**, and populates the Design panel's sections — in Figma's order and grouping: **Current variant** (variant switchers for the selected component), **Position**, **Layout** (outer/auto layout), **Appearance**, **Stroke**, **Fill**, **Effects**, **Colors**, and **Layout guide**. Each value shows its current setting and, when backed by a design token, the owning token name (traced through `var()` chains).
- **Component variant switching:** when the selection is a project component with variants (CVA), the **Current variant** section renders a dropdown per variant prop (e.g. Size, Type, Outline, State, Icon Only) so the user can switch the rendered variant just like Figma's variant picker.
- **Direct-manipulation editing:** dragging a handle (resize a component, pull a padding/margin edge) or editing a field changes the bound value; the change is applied **live and ephemerally** (injected CSS in the guest page) for instant feedback, with no file written yet.
- **Gated commit:** an explicit "Apply changes" step persists edits — **token-value edits** rewrite the token file via the existing `inspector:setTokenValue` path; **structural / component-source edits** go through a gated Claude Code run with snapshot/revert. Nothing touches disk without approval (spec-first gate).
- Selecting a component on the canvas cross-highlights its node in the tree and (when known) its Figma match, reusing the existing component/Figma reconciliation.

## Capabilities

### New Capabilities
- `run-canvas`: the Run activity's hybrid browser+canvas surface — webview-embedded live app, pan/zoom, hover/select overlay, resize & spacing handles, and the Figma-style Design panel (Layers/node tree + selection property sections) that replaces the file Explorer in this activity.
- `preview-inspector-bridge`: the guest-page instrumentation — an Electron webview guest preload that streams a component/DOM node tree, computed styles and bounding boxes to the renderer, applies ephemeral live CSS overrides for instant feedback, and maps rendered elements ↔ source components ↔ tokens.
- `visual-token-editing`: the Figma-style Design panel — the current selection's values grouped into Figma's sections (Current variant, Position, Layout, Appearance, Stroke, Fill, Effects, Colors, Layout guide) plus component-variant switching; each value is editable by handle-drag or field, previews live, then commits through a gated apply step (token-file rewrite for token values; gated Claude Code run + snapshot/revert for component-source / variant / structural changes).

### Modified Capabilities
<!-- No spec-level requirement changes to existing capabilities. inspector-tokens' write
     behavior (inspector:setTokenValue) and component-reader are reused as-is by the new
     capabilities; app-shell's Run activity is extended, not redefined at the requirement level. -->

## Impact

- **`apps/ide` (main):** enable `webviewTag` in the window `webPreferences`; add a guest-preload build target (electron-vite) for the inspector bridge; register new IPC channels.
- **`packages/core`:** new `inspector-bridge` module (node-tree/computed-style/box-model message protocol); a token→element resolution helper that inverts `token-parser.ts` usage data; extend `component-reader.ts` `previewUrl` (currently stubbed `null`) so canvas selections map to source components; new zod-typed IPC channels + preload wrappers.
- **`packages/ui`:** new `RunCanvas` view (replaces the plain iframe in `RunApp.tsx` for the app kind), a `NodeTree` sidebar (mirrors the Explorer flat-map/expand pattern), an overlay layer with handles, and an `ElementInspector` panel (token + box-model editor). Reuses `AssistantDock`, `Inspector` token widgets, `useAgentRun` gate, snapshot/restore.
- **Reused, unchanged:** `dev-server.ts` (URL resolution/start), `inspector:setTokenValue` + `snapshotTokenScope`/`restoreFiles` (revertable writes), `useAgentRun` (gated Claude Code runs), Figma reconciliation.
- **Invariants upheld:** Claude Code stays the engine for source edits (structural changes are gated runs, never re-implemented); spec-first gate (live edits are ephemeral until an explicit apply); local-first (all writes land in the project's own token/component files); safe process handling (no new spawns; webview loads only the already-resolved localhost dev URL).
- **Risk:** `<webview>` is an Electron portability/complexity surface — isolate the bridge protocol so it stays a contained module; cross-origin guest access is exactly what the webview guest preload is for (an `<iframe>` cannot do this).
