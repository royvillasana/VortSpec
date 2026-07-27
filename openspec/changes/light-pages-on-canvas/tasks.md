## 1. Serve light pages to the canvas webview

- [x] 1.1 Add a local `http` origin that serves `.vortspec/light-pages/*.html`. → `main/lite/light-serve.ts` `serveLightPages` (one per-project 127.0.0.1 server, ephemeral port, no-store, path-traversal guarded) + `lightPageUrl`; 3 tests (serve/404/traversal/reuse/url).
- [x] 1.2 Expose it to the renderer (IPC + api). → `lite:pageUrl` IPC (`{projectPath,name}`→served URL) + preload `litePageUrl` + api.
- [ ] 1.3 Verify the guest preload + inspector-bridge instrument a served light page (selection,
  tree, rects) — spike/probe; confirm nothing hard-depends on the Vite dev-stamp for identity. (GUI — needs user check once wired.)

## 2. Render a light page in the framework RunCanvas

- [x] 2.1 In RunApp, route a selected `light://<name>` page through the EXISTING RunCanvas path. → `canvasSrc = isLightPage ? lightPageSrc : embedUrl` (served via `api.litePageUrl`); `canvasReady` includes it; removed the `LightPageCanvas` branch + import; "Opening page…" spinner while the URL loads.
- [ ] 2.2 Confirm the left DesignPanel, layers, overlay, drag, move, insert operate on the light page. (GUI — needs user check.)
- [x] 2.3 No framework-only surface breaks light pages — the same RunCanvas renders; nothing new added.

## 3. Persist light-page edits as HTML/CSS/JS

- [x] 3.1 Serialize the guest DOM → write `.html`. → `bridge.serializeDom()` (webview `executeJavaScript`, strips `data-vs*`/contenteditable/overlay) + `schedulePersistLight()` (debounced) → `api.liteWritePage`.
- [x] 3.2 Route by PAGE KIND: `commitEdits`/`applyLive`/move-`onKeep` short-circuit to `schedulePersistLight` when `isLightPage`; the ts-morph path is untouched for framework pages.
- [ ] 3.3 Verify every gesture persists — style + text + drag-move wired; insert/delete/duplicate may need the guest to actually apply the op (they currently go live-override/source) → follow-up.
- [ ] 3.4 Round-trip test that a move can't nest a component inside another (needs the running canvas — user check).

## 4. Remove the parallel light editor

- [ ] 4.1 Delete `LightPageCanvas.tsx`, its right-side panel, the token-field/insert/duplicate/delete
  controls, and the light-compile-on-Convert glue that fed the on-canvas button.
- [ ] 4.2 Remove the on-canvas "Convert to code" button and its `onConvert` wiring in RunApp.
- [ ] 4.3 Remove now-dead light-canvas IPC/props (keep `readLightPage`/`writeLightPage`,
  `lite:standins`, `lite:readiness`, and the light-page prompts — still used).

## 5. Move framework generation to the Flow

- [ ] 5.1 Add a "Generate code" action in the Flow (design-system workspace) that batches the
  screens → framework conversion, targeting the framework selected in the initial flow
  (`.sdd-de/project.yaml` `framework`), reusing the deterministic compile (`compile.ts`) as the
  authoritative skeleton for React and the framework-specific compose flow for others.
- [ ] 5.2 The Generate step builds/reuses design-system components, then AUDITS + runs AI validation
  + visual validation against the screens; the screens remain the editable source of truth.
- [ ] 5.3 Surface Generate progress/results in the Flow (not the canvas); wire it to the existing
  agent-run + verify machinery.

## 6. User-facing terminology (no "light")

- [ ] 6.1 Audit and remove every user-visible "light"/"lightweight" term (site tree labels/badges,
  canvas headers, empty states, tooltips, buttons); present them as plain "pages"/"screens".
- [ ] 6.2 Keep internal names/paths (`.vortspec/light-pages/`, page-kind routing) as-is — internal only.

## 7. Optional: Astro Dynamic Islands for interactivity

- [ ] 7.1 Where a screen needs client interactivity, allow authoring it as an Astro-style Dynamic
  Island (bounded hydration) that maps onto the existing island/`data-component` model — used only
  where interactivity is actually needed, staying framework-free from the user's view.

## 8. Verify end-to-end

- [ ] 8.1 A screen renders in the canvas with the full control set (user-verified in the app).
- [ ] 8.2 Editing (text/style/drag/move/insert) persists as HTML/CSS/JS and round-trips losslessly.
- [ ] 8.3 Framework screens still edit via the ts-morph path, unchanged.
- [ ] 8.4 "Generate code" from the Flow produces validated pages in the SELECTED framework; screens intact.
- [ ] 8.5 No user-visible "light"/"lightweight" wording remains anywhere in the Playground UI.
