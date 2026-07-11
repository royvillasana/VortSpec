# Tasks — IDE guided-flow parity + auto-start + additive re-sourcing

## Step 1 — Promote Intake + GuidedFlow to `@vortspec/ui`

- [x] Move `apps/desktop/src/renderer/src/views/Intake.tsx` → `packages/ui/src/views/Intake.tsx` (verbatim); export as `@vortspec/ui/Intake`.
- [x] Move `apps/desktop/src/renderer/src/views/GuidedFlow.tsx` → `packages/ui/src/views/GuidedFlow.tsx` (verbatim); export as `@vortspec/ui/GuidedFlow`.
- [x] Add a `hideRail?: boolean` prop to `GuidedFlow`; when set, do not render `ProjectRail` (mirror `RunApp`/`SourceControl`).
- [x] Repoint `apps/desktop/src/renderer/src/App.tsx` imports to `@vortspec/ui`.
- [x] **Done when:** cockpit typechecks + its CT suite is green (relocation is behavior-preserving); `pnpm build` green.

## Step 2 — IDE Flow activity renders the actionable GuidedFlow

- [x] In `apps/ide/src/renderer/src/App.tsx`, the `flow` activity's `workPanel()` case renders `<GuidedFlow hideRail project={p} onBack={go("explorer")} onOpenRun={go("run")} onOpenPreview={go("play")} onOpenTokens={go("tokens")} onOpenManifest={go("manifest")} … />` instead of `<PipelinePanel/>`.
- [x] Wire GuidedFlow's send-to-chat / assistant hooks to the IDE's existing `setPendingRef`/`toggleSecondary` if it uses them; otherwise no-op.
- [x] Retire `PipelinePanel` from the IDE (or keep it as a small status strip — decide during impl). Keep the export if the cockpit still needs it.
- [x] Update `apps/ide/tests/ct/pipeline.ct.tsx` to assert the actionable foundation ("Extract tokens & detect components") is present.
- [x] **Done when:** the IDE Flow activity shows the actionable Intake/Foundation UI; IDE CT green.

## Step 3 — Auto-start routing (new + un-founded)

- [x] Add a `foundationReady(projectPath)` helper in `@vortspec/ui` (tokens>0 || components>0 || design-system stage approved).
- [x] IDE `App.tsx` **Create New Project**: `NewProjectWizard` `onCreated` → set `intakeProject` and render `Intake`; on intake done → open the project on the `flow` activity (Foundation).
- [x] IDE `App.tsx` **Open project**: on `setWorkspace`, await `foundationReady`; if false → `dispatch(setActivity "flow")`; if true → keep default `explorer`. Guard so it only fires once per open.
- [x] CT: opening a mock project with no tokens lands on Flow/foundation; a mock project with tokens lands on Explorer; creating a project routes through Intake.
- [x] **Done when:** creating a project in the IDE runs Intake → Foundation automatically; opening an un-founded project lands on the Foundation; a founded project lands on Explorer. Verified through the UI.

## Step 4 — Re-runnable foundation + Clean-sweep vs Merge (Figma URL)

- [x] Add an **add-a-source** input to the Foundation (defaults to the project's configured Figma URL; accepts another Figma URL).
- [x] When the project is already `foundationReady` and extraction is triggered, show a **Clean sweep vs Merge** choice before launching the run.
- [x] Map the choice to the existing SDD-DE prompts: clean-sweep → source-extract (replace); merge → additive re-scan/reconcile against the new source; instruct the reconcile to **flag** same-name/different-value conflicts (not overwrite).
- [x] Vitest: mode → prompt selection; conflict-flagging instruction present in the merge prompt. CT: the choice appears only when a foundation already exists.
- [x] **Done when:** re-running the foundation with a second Figma file offers Clean-sweep vs Merge and merges additively with conflicts flagged.

## Step 5 — Fast-follow: zip/folder source kind

- [x] Extend the foundation config with a non-Figma source kind (`code`/`local`) + path; accept a picked zip/folder, stage it in the project, pass its path to the extract prompt.
- [x] **Done when:** a zip/folder of components can be added as a source via the same Clean-sweep/Merge flow.

## Verification

- [x] `pnpm build && pnpm test && pnpm lint` green.
- [ ] End-to-end through the UI: create a project → Intake → Foundation runs; open an un-founded project → lands on Foundation; add a second Figma source → Merge → tokens/components added, conflicts flagged; cockpit unchanged. *(Hands-on — needs the running app + a real Figma file / gated Claude run.)*
