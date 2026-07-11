# Design — IDE guided-flow parity + auto-start + additive re-sourcing

## Confirmed decisions
- Approach: **reuse the cockpit's `GuidedFlow`** (promote it + `Intake` to `@vortspec/ui`).
- Auto-start scope: **new AND un-founded** projects.
- Merge semantics: merge **tokens + components**, dedupe **by name**; existing kept, new added, same-name/different-value **flagged** (never silently overwritten).
- Source kinds v1: **Figma URLs** (a second Figma file = same mechanism); **zip/local folder** of components is a fast-follow.

## 1. Relocation (parity by construction)

`Intake.tsx` (261 LOC) and `GuidedFlow.tsx` (~1000 LOC) import only `@vortspec/core` + `@vortspec/ui`. Move them **verbatim** to `packages/ui/src/views/{Intake,GuidedFlow}.tsx`, export as `@vortspec/ui/Intake` and `@vortspec/ui/GuidedFlow`, and repoint the cockpit's `apps/desktop/src/renderer/src/App.tsx` imports. The diff must be relocation-only so cockpit behavior is unchanged (verify: cockpit CT still green).

`GuidedFlow` renders `ProjectRail` directly; add a `hideRail?: boolean` prop (mirroring `RunApp`/`SourceControl`) so the IDE — which already has an ActivityBar — hides the internal rail. The rail's nav callbacks (`onOpenRun`, `onOpenPreview`, …) map to the IDE's `go(activity)` dispatch.

## 2. `foundationReady` (the routing signal)

A project's foundation is "ready" when it has produced tokens or a component inventory:

```
foundationReady(projectPath) =
  (await api.inspectorTokens(path)).tokens.length > 0
  || (await api.getFlow(path)).state has a design-system stage marked approved
  || .sdd-de/components.json has entries
```

Expose a tiny helper in `@vortspec/ui` used by both the auto-start router and `GuidedFlow`'s own `foundationReady` gate (it already computes `(tokenCount ?? 0) > 0 || total > 0`).

## 3. IDE routing (auto-start)

In `apps/ide/src/renderer/src/App.tsx`:

- **Create New Project** (`NewProjectWizard` `onCreated`): instead of jumping to Explorer, set an `intakeProject` and render `Intake` (same as the cockpit). On intake done → open the project on the **Flow** activity with `GuidedFlow` showing the Foundation.
- **Open a project:** on `setWorkspace`, check `foundationReady`. If **false** → force `activity = "flow"` (Foundation). If **true** → keep the default (`explorer`). The user can always navigate to Flow later.
- The `flow` activity's `workPanel()` case renders `<GuidedFlow hideRail … />` instead of `<PipelinePanel/>`, wired to the IDE's `go()` navigation.

This mirrors the cockpit's Create → Intake → GuidedFlow sequence (`apps/desktop/App.tsx`), now in the IDE.

## 4. Re-runnable foundation + Clean-sweep vs Merge

The Foundation screen (in `GuidedFlow`) already has "Extract tokens & detect components" and a re-extract path. Extend it:

- **Add-a-source input:** an optional field to point the foundation at a **new source** — another Figma URL (v1) or a picked zip/folder (fast-follow). Defaults to the project's configured source.
- **Mode prompt:** when the project **already** `foundationReady` and the user runs extraction, show a choice **before** launching the run:
  - **Clean sweep** → run the fresh **source-extract** prompt (`FOUNDATION_DEF.promptTemplate`) against the source — replaces tokens/components.
  - **Merge / Add** → run the **existing additive re-scan / reconcile** prompt (already additive-only) against the new source — dedupe by name, add new, keep existing.
- **Conflict flagging:** the reconcile prompt is instructed to **list** any token/component whose name already exists with a different value under a "Conflicts" section it writes to the manifest/report, rather than overwrite — surfaced to the user as a review note. VortSpec does not resolve conflicts itself (methodology stays in Claude Code).
- **No pipeline change:** VortSpec only picks which existing prompt to run and passes `{ source, mode }`. The prompts live in `sdd-prompts.ts`; if a dedicated "merge additional source" phrasing is needed it is an additive prompt template, not a change to the flow definitions.

Source-kind handling:
- **Figma URL:** already supported — pass the URL to the foundation prompt (the CLI reads it via figma-cli/MCP).
- **Zip/folder (fast-follow):** copy/extract into a staging path in the project and pass that path as a `code`/`local` source to the extract prompt. Requires a small `foundation config` extension (source kind + path); out of steps 1–3.

## 5. What ships in steps 1–3 vs later

- **Steps 1–3 (now):** relocation + `hideRail`; IDE Flow → `GuidedFlow`; auto-start routing for new + un-founded projects. This gives the IDE the intake → foundation pipeline with parity and auto-start.
- **Step 4 (next):** the add-source input + Clean-sweep/Merge prompt, wired to the two prompt modes (Figma URL).
- **Step 5 (fast-follow):** zip/folder source kind.

## 6. Invariants check

- **Same steps as the CLI:** the IDE now runs the identical Intake + Foundation the cockpit/CLI do (shared code). ✓
- **Claude Code is the engine / no methodology change:** foundation and reconcile are the existing gated SDD-DE runs; VortSpec only orchestrates mode + source. ✓
- **Spec-first gate / local-first:** unchanged — outputs land in the project's token/component files; gated runs. ✓
- **Human-sentence errors:** the mode prompt and any conflict flags are plain sentences with next steps. ✓
