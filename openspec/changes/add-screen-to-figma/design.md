## Context

VortSpec's Playground previews the project's running app and lets the user vibe-engineer screens. Figma access in VortSpec is delegated: the cockpit never opens a Figma connection — the engine does, via `figma-cli` (local Desktop, no token; `packages/core/src/main/figma/figma-cli.ts`) or a scoped Claude Code run using the user's own global Figma MCP (a run gets Figma by **not** setting `strictMcp` and setting `bypassPermissions: true`). The token push (`figma-token-push`) already ships this exact CLI-preferred / MCP-fallback pattern from the Inspector; this change is its screen-level sibling. The official Figma MCP provides the round-trip skills: `figma-generate-design` + `figma-use` (code → design) and `figma-design-to-code` + `get_design_context` (design → code), plus `generate_figma_design` to rasterize a running web app for pixel/image reference.

## Goals / Non-Goals

**Goals**
- One-click send of the currently-previewed screen to Figma as a **design-system-linked** view (instances + variable/style bindings).
- A reviewed **pull-back** that applies Figma edits to the screen source, gated like a canvas Apply.
- A durable screen↔Figma mapping so re-send updates in place and pull-back targets the right node.
- Zero direct Figma connection from VortSpec; hold spec-first gating on pull-back.

**Non-Goals**
- Real-time / continuous sync (this is on-demand, per click).
- Sending the whole app at once (v1 is per-screen — the previewed one).
- A VortSpec-managed Figma MCP config (we use the user's global server, like the token push).
- Re-implementing the Figma generation logic as deterministic `figma-cli` scripts in v1 (the MCP run + skills is the v1 writer for screens; a `figma-cli` fast path is a later optimization).

## Decisions

### 1. Execution model — MCP run for screens (v1), CLI-preferred where feasible
Screen generation is a multi-step, skill-guided agent task (discover DS components/variables → assemble section by section → validate screenshots). v1 runs it as a scoped Claude Code run using the user's Figma MCP (`figma-generate-design` + `figma-use`), started with `bypassPermissions: true` and **no** `strictMcp`. `figma-cli` is still used for the **connection gate** (`ensureConnected`) and remains the target for a future fast path. Rationale: parity with the token push's fallback path, and the generation skills are MCP-native.

### 2. Send fidelity — DS-linked build + raster reference (then delete)
Per the `figma-generate-design` skill: rebuild with component instances + variable bindings, and when the screen contains images, run `generate_figma_design` in parallel to capture the running preview, transfer `imageHash`es, then delete the capture. This yields an editable, updatable frame (good for pull-back) with pixel/image fidelity.

**Component resolution — local components are the primary case.** VortSpec projects are typically extracted from a Figma file whose design-system components are **local to that file** (created in it), which is how the components are used today. For a local component, instance it directly: `figma.getNodeByIdAsync(<figmaNodeId from components.json>)` → `.createInstance()` — no `importComponentSetByKeyAsync`, no published-library requirement. `importComponentSetByKeyAsync(<componentKey>)` is the **fallback** only when the component is a published/remote library component (Decision 4 keeps us in the same file, so local instancing is the norm). Because each code component already carries a `figmaNodeId` in `.sdd-de/components.json`, resolution is a direct id lookup, not a search.

### 3. Round-trip mapping — `.vortspec/maps/screens.json`
Parallels the existing durable maps (`.vortspec/maps/components.json`, `.vortspec/maps/tokens.json`). Shape:
```jsonc
{
  "figmaFileKey": "<per-project screens file key>",
  "screens": {
    "<screenKey>": { "file": "src/screens/Foo.tsx", "figmaNodeId": "123:45", "updatedAt": "<iso>" }
  }
}
```
`screenKey` = the stable route path (router apps) or the source file / screen component name (state-navigated apps), resolved from `RunApp.currentPageFile` + `routes`. Read/written by a new core module `figma/screen-map.ts` behind IPC; the run reports the created `fileKey`/`nodeId` and VortSpec persists them (the run itself does not write `.vortspec/`).

### 4. Target file — the project's existing design-system file (so local components are usable)
The screen is sent **into the project's existing design-system Figma file** — the one the components live in (`components.json` `fileKey` / `project.yaml` `figma_file_url`) — placed on a dedicated **"Screens" page or section** within it. This is required for the local-component case (Decision 2): local components are file-scoped and cannot be instanced into a different file, so building the screen anywhere else would forfeit the ability to use them.

Only as a **fallback** — when no design-system file is recorded, or the design system is consumed as a published external library rather than local components — does the run create a separate `VortSpec — <project> Screens` file (via `create_new_file`, gated by `figma-create-new-file`). Whichever file is used, its key is persisted to `.vortspec/maps/screens.json`; subsequent sends reuse it and re-sending a mapped screen updates its existing frame (skill Step 6 "Updating an Existing View").

### 5. Pull-back is gated like Apply
The design→code run edits the screen source, then flows through the existing review machinery in `RunApp.tsx` (snapshot → run → Keep/Revert → reload), the same path a structural canvas Apply uses. This preserves spec-first gating and gives a clean revert.

### 6. Progress + result UI
A new `figmaMod = useAgentRun()` drives status. While running, extend the `skeleton` memo so the existing `AiWorkingPill` shows "Sending to Figma…" / "Pulling from Figma…". On completion, a `FigmaBridgePanel` (modeled on `RunDoctor`) shows **Open in Figma** (the mapped node URL) and **Pull changes back**; on error it shows the failure with a retry.

### 7. Model routing
Both directions are generative (screen composition; design→code adaptation), so route to a capable tier (Sonnet/Opus), not the cheap tier used for mechanical token/style patches. Follows the project's right-size-the-model guidance.

## Flow

**Send (code → design)**
1. User clicks the toolbar Figma button (enabled only if Figma connected).
2. VortSpec resolves the previewed screen source (`currentPageFile`) + preview URL + the DS component/variable maps, reads `.vortspec/maps/screens.json` for the target `fileKey`/existing `nodeId`.
3. `figmaMod.start(buildSendScreenPrompt(...))` — scoped run, user's Figma MCP, `figma-generate-design`/`figma-use`; creates/updates the frame, returns `{ fileKey, nodeId, url }`.
4. VortSpec persists the mapping; `FigmaBridgePanel` shows Open in Figma + Pull changes back.

**Pull back (design → code)**
1. User edits in Figma, clicks "Pull changes back".
2. `figmaMod.start(buildPullScreenPrompt(...))` — reads the mapped node (`get_design_context` + `figma-design-to-code`), edits the screen source.
3. Changes enter the Apply review gate (Keep/Revert); Keep reloads the preview.

## Prompts

- `buildSendScreenPrompt({ file, previewUrl, fileKey?, nodeId?, componentMapPath, tokenMapPath })` — instructs the run to follow `figma-generate-design` + `figma-use`, create the target file if `fileKey` absent, build/update the screen from `file` reusing the DS maps, and RETURN `{ fileKey, nodeId, url }` as its final structured line.
- `buildPullScreenPrompt({ file, fileKey, nodeId })` — instructs the run to follow `figma-design-to-code`, `get_design_context` on `fileKey`/`nodeId`, and apply the changes to `file` using existing project components/tokens.

Both parallel the token push's `pushPrompt` (a pre-scoped, skill-anchored prompt for a gated run).

## Risks / Trade-offs

- **Cost/latency:** a full DS-linked send is a heavy multi-call run. Mitigate with visible progress, a cancel affordance (`figmaMod.cancel`), and only running on explicit click.
- **Mapping drift:** renamed/moved screens can orphan a `screenKey`. Mitigate by keying on the stable route path where available and reconciling against `routes`; align with the durable-key work in `docs/screen-preview-and-figma-mapping-plan.md` (thread B).
- **DS coverage gaps:** elements with no matching DS component fall back to manual frames (skill behavior). Acceptable; the raster reference keeps them visually correct.
- **Connection ambiguity:** `extract-design-system` skill still prefers the Desktop Bridge while VortSpec's `figma-health.ts` prefers remote MCP. Use the same connection the token push uses; note the reconciliation as out-of-scope follow-up.
- **Pull-back fidelity:** design→code is inherently lossy; the review gate (Keep/Revert) makes it safe and reversible.

## Migration / Testing

- No migration; `.vortspec/maps/screens.json` is created on first send.
- Unit: `screen-map.ts` read/write + `screenKey` resolution; prompt builders produce the expected scoped instructions.
- Recorded transcript fixtures for the send and pull-back runs (parallel to the token-push MCP-run fixture).
- CT: the toolbar renders the Figma button and gates it on `figmaConnected`; a mocked send drives the "Sending to Figma…" pill and the result panel.
