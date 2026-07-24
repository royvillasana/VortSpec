## Why

Token sync is now two-way (`figma-token-push`), but whole **screens** are still one-way: the user vibe-engineers a page in the Playground and it lives only as code. There is no way to hand a finished screen back to a designer in Figma, iterate on it there, and bring those design changes back into the code. Designers work in Figma; the current flow strands them. A one-click "Send to Figma" round-trip closes the loop — code → design → code — without breaking VortSpec's invariant that it never calls Figma directly.

## What Changes

- Add a **Figma button to the bottom canvas toolbar** in the Playground. One click sends the **currently-previewed screen** to Figma.
- **Send (code → design):** the screen is rebuilt in Figma as **design-system-linked component instances + variable bindings** (via the user's own Figma MCP with the `figma-generate-design` + `figma-use` skills), using `generate_figma_design` as a pixel/image reference that is deleted after transfer. The result is an editable, DS-linked frame — not a flat raster.
- **Pull back (design → code):** after editing in Figma, a **"Pull changes back"** action reads the mapped node (`get_design_context` + `figma-design-to-code`) and applies the changes to the screen's source, **gated through the existing canvas Apply review (Keep/Revert)** and hot-reloaded. Both directions ship in v1.
- **Round-trip mapping:** a new durable map `.vortspec/maps/screens.json` records the per-project Figma `fileKey` and each screen's `nodeId`. On first send, a per-project Figma file (`VortSpec — <project> Screens`) is created and its key persisted, so pull-back always targets the right node.
- **Delegation (unchanged invariant):** VortSpec opens **no** direct Figma connection. The write/read is performed by the engine — `figma-cli` (preferred, local Desktop, no token) or a scoped Claude Code run using the user's own global Figma MCP (**no** `strictMcp`, `bypassPermissions: true`). This mirrors the token-push execution model.
- **Connection gate:** the button is disabled with a "Connect Figma" affordance when neither `figma-cli` nor the user's Figma MCP is available (reusing the token-push connection check).

## Capabilities

### New Capabilities
- `screen-to-figma`: The screen round-trip — sending the currently-previewed screen to Figma as a design-system-linked view, storing the durable screen↔node mapping, and pulling Figma edits back into the screen source under a review gate. Covers the explicit-trigger contract, the CLI-preferred / MCP-fallback execution model, target-file provisioning, the mapping store, and the reviewed pull-back.

### Modified Capabilities
- `canvas-toolbar`: The bottom canvas toolbar gains a "Send to Figma" control (with connection-gated enablement and in-place send/sent/failed status). New requirements for the trigger button and its status surfacing; the existing mode/viewport controls are unchanged.

## Impact

- **UI** (`packages/ui/src/`):
  - `components/run-canvas/CanvasToolbar.tsx`: new Figma button (props: `onSendToFigma`, `figmaStatus`, `figmaConnected`).
  - `components/run-canvas/RunCanvas.tsx`: thread the new props through.
  - `views/RunApp.tsx`: a new `figmaMod = useAgentRun()` driving `sendToFigma()` / `pullFromFigma()`, grounded on `currentPageFile` + `embedUrl`; progress via the existing `skeleton`/`AiWorkingPill`; a result panel with **Open in Figma** + **Pull changes back**, and pull-back routed through the existing Apply Keep/Revert flow.
  - New `components/run-canvas/FigmaBridgePanel.tsx` (send/sent/failed + round-trip actions, modeled on `RunDoctor`).
- **Core main** (`packages/core/src/main/`):
  - New `figma/screen-map.ts`: read/write `.vortspec/maps/screens.json` (fileKey + per-screen nodeId), and resolve/persist the per-project screens file.
  - Reuse `figma/figma-cli.ts` + `figma/figma-health.ts` for the connection gate; a `figma-cli` eval path for the send may be added later (MCP run is the v1 writer for screens).
- **Prompts** (`packages/core/src/shared/`): `buildSendScreenPrompt` and `buildPullScreenPrompt`, parallel to the token push's `pushPrompt`, embedding the relevant Figma skill guidance + screen source + mapping + target `fileKey`.
- **IPC** (`packages/core/src/shared/`): contracts to read/write the screens map and to resolve/create the target file; Zod at the boundary.
- **Invariants:** must hold spec-first gating (pull-back is reviewed like Apply), the-user's-own-Claude, real-binary delegation, and **never-call-Figma-directly**.
- **Tests:** unit tests for the screens-map read/write + mapping resolution; recorded transcript fixtures for the send and pull-back runs; a CT asserting the toolbar button renders and gates on connection.
