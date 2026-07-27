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

- [x] 4.1 Delete `LightPageCanvas.tsx` (its right-side panel, token-field/insert/duplicate/delete controls). Done — file removed; `light-compile.ts` kept for the Flow Generate step.
- [x] 4.2 Remove the on-canvas "Convert to code" button + `onConvert` wiring — gone with the LightPageCanvas branch; dropped the dead `buildConvertToFrameworkPrompt` import.
- [x] 4.3 Removed now-dead RunApp state (`lightPageHtml`/`liteStandIns`/`liteReadiness` + their loads); kept `readLightPage`/`writeLightPage`, `lite:standins`, `lite:readiness`, and the light-page prompts.

## 5. Move framework generation to the Flow

- [x] 5.1 "Generate code" action in the Flow → `buildGenerateCodePrompt(names)` (converts ALL screens, targets the framework from `.sdd-de/project.yaml`, NOT hardcoded React) + `buildProjectGenerateCodePrompt` (lists screens via `listLightPages`) + `lite:generatePrompt` IPC; button in the Flow's palette header (`GuidedFlow`), gated on screenCount. 3 tests.
- [x] 5.2 The prompt builds/reuses components, requires token discipline, then AUDITS + VISUAL-VALIDATEs each page against its screen; the screens stay UNCHANGED as the editable source of truth.
- [x] 5.3 Runs via the Flow's `op()` (agent-run machinery, shows the run card); progress surfaces in the Flow, not the canvas.

## 6. User-facing terminology (no "light")

- [x] 6.1 Removed user-visible "light"/"lightweight" wording: DesignSystem header "— lightweight palette" → "— components & tokens"; GuidedFlow toggle "← Light design system" → "← Design system" (+ title); framework-view subtext "the React component roster" → "the component roster" (framework-agnostic). Sitemap had no light label; the AssistantDock directive stays (AI-facing, internal, not user UI).
- [x] 6.2 Kept internal names/paths (`.vortspec/light-pages/`, page-kind routing, code comments) — internal only.

## 7. Optional: Astro Dynamic Islands for interactivity

- [x] 7.1 Where a screen needs client interactivity, allow authoring it as an Astro-style Dynamic
  Island (bounded hydration) that maps onto the existing island/`data-component` model — used only
  where interactivity is actually needed, staying framework-free from the user's view. → `buildLightPagePrompt`
  step 5 (SELF-CONTAINED framework-free `<script>` island scoped to a `data-component`, marked
  `data-island`, only where needed); `LIGHT_FIRST_PAGE_DIRECTIVE` (AssistantDock) mirrors it; `serializeDom`
  preserves islands (only strips `script[data-vs]`); `buildGenerateCodePrompt` step 4 converts each
  `data-island` to the framework's idiomatic interactive component (not a copied script). 2 tests.

## 8. Verify end-to-end

- [ ] 8.1 A screen renders in the canvas with the full control set (user-verified in the app).
- [ ] 8.2 Editing (text/style/drag/move/insert) persists as HTML/CSS/JS and round-trips losslessly.
- [ ] 8.3 Framework screens still edit via the ts-morph path, unchanged.
- [ ] 8.4 "Generate code" from the Flow produces validated pages in the SELECTED framework; screens intact.
- [ ] 8.5 No user-visible "light"/"lightweight" wording remains anywhere in the Playground UI.

## 9. Automatic background component build

- [x] 9.1 Auto-start the component build in the BACKGROUND when a project has detected-but-unbuilt (`status === "unknown"`) components → `useAutoComponentBuild` hook (`chunkByLevel` 5 at a time → `buildChunkPrompt({verify,storybook,manifest})` per chunk, chained on run-done), in the configured framework (agent reads project.yaml), no click. POLLED (15s) so it fires the MOMENT the design system is created mid-session, not only if components exist at open.
- [x] 9.2 Non-blocking + resilient: runs at the APP level via the run machinery (survives navigation); starts at most once per project (`startedRef`), and only when `hasActiveRun` is false — never fights a user-started build. ensureStyling + ensureStorybook first.
- [x] 9.3 App-level running indicator ("Building … N left") + a completion toast when `justFinished` bumps.
- [ ] 9.4 Verify in the app (GUI — needs user check): auto-start 5-at-a-time build+verify in the selected framework; user keeps editing; completion notice; already-built projects don't re-run.
