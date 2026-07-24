## 1. Core: mapping + target file + connection

- [x] 1.1 Add `packages/core/src/main/figma/screen-map.ts`: Zod-validated read/write of `.vortspec/maps/screens.json` (`{ figmaFileKey, screens: { <key>: { file, figmaNodeId, updatedAt } } }`); helpers to get/set the project `fileKey`, upsert a screen mapping, and look up by `screenKey`. The default target `fileKey` resolves to the project's **existing design-system file** (`components.json` `fileKey` / `project.yaml` `figma_file_url`) so local components are usable; a created fallback file's key overrides it once recorded.
- [x] 1.2 Add a `screenKey` resolver shared with the renderer (stable route path for router apps; source file / screen name for state-navigated apps), derived from `routes` + `currentPageFile`.
- [x] 1.3 IPC contracts (`packages/core/src/shared/`): `screenMap:get`, `screenMap:upsert`, `screenMap:setFileKey` (Zod at the boundary); expose via preload as `api.screenMap*`.
- [x] 1.4 Reuse the token-push connection gate: expose current Figma connectivity (`figma-cli` ensureConnected / user MCP health) to the renderer for the button's enabled state (mirror `figmaConnected` in Inspector).

## 2. Core: prompt builders

- [x] 2.1 `buildSendScreenPrompt({ file, previewUrl, fileKey?, nodeId?, componentMapPath, tokenMapPath })` in `packages/core/src/shared/` — anchors the run to `figma-generate-design` + `figma-use`, targeting the project's existing design-system file (a Screens page/section) and **instancing the mapped local components by `figmaNodeId`** (`importComponentSetByKeyAsync` only as the published-library fallback); uses `figma-create-new-file` only when no DS `fileKey` exists, and `generate_figma_design` when the screen has images; builds/updates the frame from `file` and REQUIRES a final structured line `{ fileKey, nodeId, url }`.
- [x] 2.2 `buildPullScreenPrompt({ file, fileKey, nodeId })` — anchors the run to `figma-design-to-code` + `get_design_context` on the mapped node and applies changes to `file` using existing project components/tokens.
- [x] 2.3 Unit tests for both builders (scoped skill references, no `strictMcp`, structured-return contract).

## 3. UI: toolbar button + threading

- [x] 3.1 `CanvasToolbar.tsx`: add a trailing divider + Figma-logo `ModeBtn`-style button after the viewport selector; new props `onSendToFigma`, `figmaStatus` ("idle"|"sending"|"sent"|"error"), `figmaConnected`; disabled + tooltip when not connected; spinner/label while sending.
- [x] 3.2 `RunCanvas.tsx`: thread `onSendToFigma` / `figmaStatus` / `figmaConnected` from props into `CanvasToolbar`.
- [x] 3.3 Wire the props at the `RunApp.tsx` `<RunCanvas>` render site.

## 4. UI: runs, progress, result panel, pull-back

- [x] 4.1 `RunApp.tsx`: add `const figmaMod = useAgentRun()`; `sendToFigma()` resolves the previewed screen (`currentPageFile`) + `embedUrl` + maps + target `fileKey`, then `figmaMod.start(buildSendScreenPrompt(...), { bypassPermissions: true, model: <capable tier> })` (no `strictMcp`).
- [x] 4.2 On send completion, parse the run's `{ fileKey, nodeId, url }` and persist via `api.screenMap*`.
- [x] 4.3 Progress: extend the `skeleton` memo so `AiWorkingPill` shows "Sending to Figma…" / "Pulling from Figma…" while `figmaMod.model.status === "running"`.
- [x] 4.4 Add `components/run-canvas/FigmaBridgePanel.tsx` (modeled on `RunDoctor`): sent state with **Open in Figma** (mapped node URL) + **Pull changes back**; error state with retry.
- [x] 4.5 `pullFromFigma()`: `figmaMod.start(buildPullScreenPrompt(...))`, then route the resulting source edits through the existing Apply review (snapshot → Keep/Revert → reload). Gate the action on an existing mapping for the current screen.

## 5. Tests

- [x] 5.1 Unit: `screen-map.ts` read/write + `screenKey` resolution (router + state-navigated).
- [ ] 5.2 Recorded transcript fixtures for the send and pull-back runs (parallel to the token-push MCP-run fixture).
- [x] 5.3 CT: toolbar renders the Figma button; disabled when `figmaConnected` is false; a mocked send drives the "Sending to Figma…" pill and the `FigmaBridgePanel`.

## 6. Verify

- [x] 6.1 `check-types` clean for `packages/core`, `packages/ui`, `apps/ide`.
- [ ] 6.2 Manual/live: connect Figma, send a real screen → confirm a DS-linked frame appears in the per-project file and `.vortspec/maps/screens.json` records it; edit in Figma → Pull changes back → review → Keep → preview reflects the change.
- [ ] 6.3 Confirm no direct Figma connection is opened by VortSpec (writes go through `figma-cli` or the user's MCP run only).
