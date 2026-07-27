## Why

The Playground has ended up with TWO different visual editors: the real framework
canvas we spent days building (the `<webview>` + inspector-bridge + left-sidebar
DesignPanel + drag/move/select/layers, persisting to React source) and a separate,
parallel light-page editor (`LightPageCanvas`, a parent-instrumented iframe with its
own right-side controls). That second editor is the wrong thing: the DesignPanel can't
see it, the controls are duplicated and inferior, and the two experiences diverge.

What was actually wanted from the start is ONE editor — the framework canvas, unchanged
in look and behavior — used to author/edit **light pages** whose output is **HTML/CSS/JS**
instead of React. Same screen, same handlers, same left-sidebar controls; only the
source it reads and the code it writes change. This also sidesteps the fragile ts-morph
React reconcile (which silently nested one component inside another during a move) because
a light page's DOM *is* its source, so persisting an edit is a lossless serialize.

## What Changes

- The framework RunCanvas (webview + inspector-bridge + DesignPanel + drag/move/select/
  layers/insert) becomes the SINGLE Playground editor, used for **both** framework screens
  and **light pages**. No new editing controls are introduced.
- A light page renders **inside that same canvas**: its `.vortspec/light-pages/<name>.html`
  is served so the canvas webview loads it with the guest preload, so the bridge instruments
  it exactly like a framework screen (the left DesignPanel, layers, selection, drag, move,
  and insert all work on it).
- Canvas-edit **persistence is routed by page kind**: a light page's edits are written as
  HTML/CSS/JS by serializing the live DOM (lossless), NOT through the ts-morph React codemod.
  The same `CanvasEdit` gestures and the same DesignPanel handlers drive both.
- **BREAKING (internal):** remove the separate `LightPageCanvas`, its right-side editing
  panel, and the on-canvas "Convert to code" button. Framework code is no longer generated
  from the light canvas.
- **User-facing terminology hides the implementation.** The user never sees "light" or
  "lightweight" anywhere in the UI — they simply create and edit "pages"/"screens". Internally
  those are HTML/CSS/JS (optionally using Astro-style Dynamic Islands for interactivity); that
  detail is never surfaced to the user.
- **Framework generation moves to the Flow** as an explicit, batched "Generate code" step:
  when the user has created and approved their screens, it converts them to code in the
  framework the user selected in the **initial flow / setup** (`.sdd-de/project.yaml`
  `framework` — React, Vue, Svelte, etc., NOT hardcoded to React), building/reusing the
  design-system components, then audits + AI-validates + visual-validates. A separate step,
  not part of editing.
- Playground page creation authors these HTML/CSS/JS screens via the chat; the selected
  framework's version is produced only by the Flow's Generate step.

## Capabilities

### New Capabilities
- `canvas-light-page-editing`: the framework RunCanvas renders and edits a light page
  (served `.vortspec/light-pages/*.html` in the same webview + bridge), with the full
  existing control set (DesignPanel, select, drag, move, insert, layers) working on it.
- `light-page-edit-persistence`: canvas edits on a light page are persisted as HTML/CSS/JS
  by serializing the live DOM (lossless), routed by page kind instead of the ts-morph path.
- `flow-generate-framework-code`: an explicit, batched Flow action that generates code in the
  user's SELECTED framework (from the initial flow / `project.yaml`) from the screens — build/reuse
  components, audit, AI + visual validation.
- `screen-terminology`: the UI presents these as plain "pages"/"screens" and never exposes the
  "light"/"lightweight"/HTML-implementation detail to the user.

### Modified Capabilities
- None. The framework (React/ts-morph) canvas path is untouched; light-page support is added
  entirely through the three new capabilities above (rendering source + persistence + the Flow
  Generate step), so no existing spec's requirements change.

## Impact

- Renderer: `RunApp.tsx` (drop the `LightPageCanvas` branch + right panel + Convert button;
  route the light page through the existing RunCanvas + DesignPanel), `RunCanvas.tsx` (load a
  light-page source), the canvas-edit dispatch (route persistence by kind). Remove
  `LightPageCanvas.tsx`.
- Main: serve `.vortspec/light-pages/*.html` to the canvas webview (a static/local surface +
  guest preload); a light-page persistence path that serializes the guest DOM → `.html`
  (reuse the DOM-as-source model), parallel to `canvas/write.ts`'s ts-morph path.
- Core (VortSpec-only, tracked): the light↔framework compile (`compile.ts`) feeds the Flow's
  Generate step; the light-page prompts (`light-page.ts`) stay for authoring.
- No change to the SDD-DE toolkit. VortSpec never calls Figma directly.
