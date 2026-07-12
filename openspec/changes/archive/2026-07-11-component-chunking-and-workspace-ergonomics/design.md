# Design — Component chunking & workspace ergonomics

## Chunked builds (WS1)

The chunk loop lives in the **renderer** (`GuidedFlow.tsx`), not a new main-process orchestrator, because `op()` already awaits each `claude -p` run to completion and already funnels a model tier through `routedModel`. Sequencing chunks is therefore a `for`-loop over `op()` — each iteration is a fresh process with its own `--model`, giving per-chunk routing for free and reusing `run-manager`'s resume/history per run.

- `chunkByLevel(components, size = 5)` — pure helper (unit-tested). Preserves atom→molecule→organism order, slices into groups of ≤5, kept homogeneous by level where the boundary allows.
- `tierForChunk(chunk)` → `"sonnet"` if any organism, else `"haiku"`. Never returns opus/fable for builds.
- `buildChunkPrompt(names, opts)` in `sdd-prompts.ts` — scopes one run to the named components, reusing the existing `RESUMABLE` skip-if-on-disk clause and ordering, and appends `/storybook` + `/design-doc` per chunk when requested (and `/visual-verify` + `/adversarial-review` when `verify`).
- Cancelation: a ref flag checked between chunks. Already-built chunks persist (RESUMABLE + file-derived roster status), so a canceled run leaves usable, consistent state.

**Rejected alternative:** a main-process multi-run orchestrator beside `run-manager.startRun`. It would duplicate the per-run resume/history machinery for no benefit; the renderer loop is lower-risk.

**Effort flag (deferred):** true per-run *reasoning effort* would require threading an `effort` field through `agentRunOptionsSchema` → `adapter.ts` argv → `op()`. Model-tier routing already satisfies "by complexity"; effort is out of scope.

## ZIP picker (WS2)

The app captures a **path only** and writes it to `.sdd-de/project.yaml` (`zipFilePath`); Claude Code / the SDD-DE CLI performs extraction. This preserves "Claude is the engine" and avoids adding an app-side unzip dependency. A new `workspace:pickFile` IPC mirrors `pickFolder` with `properties: ["openFile"]` + a filter; drops reuse the existing preload `getPathForFile` and the `AssistantDock` drop pattern.

## Autosave + assisted commit (WS4)

Autosave is **disk-only** (debounced `save` reusing `api.writeFile`); git stays manual per the *assisted commit* decision, so no auto-commit noise and no history rewrite. The persistent indicator reads the `gitStatus` the status bar already fetches (currently only the branch is kept). The "Draft message" action is a small scoped `haiku` run over the staged diff — spends usage only on explicit click.

## Home icon (WS3)

`"home"` is an **action**, not a layout panel: intercepted in the ActivityBar `onSelect` to call the existing `setWorkspace(null)` path. It is not added to the `Activity` union.

## Tokens where-used (WS5)

Pure UI: the `usage: Record<string, TokenUsage[]>` map already exists. Rows become clickable (open the component source) and property hits are grouped per component.
