## Context

`GuidedFlow.tsx` renders `DEFAULT_FLOW` (`shared/flow.ts`) as a vertical timeline
persisted to `.vortspec/flow.json`. Completion is `requiredDone ===
requiredDefs.length`. The `components` stage (`ComponentsStage`) builds all or
one-by-one and gates on an Approve; built-state is a session `Set`. Verification,
sync, manifest, and commit are subsequent linear stages. The SDD-DE CLI itself is
per-component (`/generate-artifacts` → implement → `/visual-verify`).

Existing seams to reuse: `useAgentRun`/`RunPanel` (runs + chat), the run-recorder,
`.sdd-de/components.json` (`detectedComponentsSchema`), the inspector
component-reader (already derives per-component status from source + verify
reports — see `getInspectorComponents` returning `status: verified|has-issues|
built|unknown`), the manifest data layer + screen, the flow-manager gate/approval
plumbing, and `setPublishTarget` for opt-in GitHub.

## Goals / Non-Goals

**Goals:**
- Replace the terminating linear flow with a workspace that never declares "done."
- A continuous component roster with file-derived per-component status that
  persists across sessions.
- Always-available "Add components": build all detected, build selected, or
  describe a brand-new component that gets generated into the system.
- On-demand outputs: regenerate the manifest anytime; optional, de-emphasized
  publish.
- Preserve SDD-DE methodology (per-component generate-artifacts → implement →
  visual-verify) and spec-first gates.

**Non-Goals:**
- Re-implementing agent logic or the skills — build/verify/manifest run the real
  Claude Code skills.
- Removing the manifest approval gate (it stays; the manifest is the hand-off).
- Reworking the Playground/Tokens/Manifest screens (only the Flow screen changes;
  it links to them).
- A dependency graph / ordering engine for components (build order stays
  atoms→molecules→organisms as today; no new solver).

## Decisions

- **Roster status is file-derived, reused from the inspector reader.** The
  workspace reads component status via the same logic as
  `getInspectorComponents` (source present → built; verify report → verified /
  has-issues; else detected). No session `Set`; status persists because it comes
  from disk. This also keeps one source of truth with the Inspector/Playground.
- **`components.json` is the roster of record; new components append to it.**
  "Describe a new component" runs a scoped Claude Code step that (a) appends a
  `{name, level, description}` entry to `.sdd-de/components.json`, then (b) runs
  the same per-component build (`/generate-artifacts` → implement). Detection and
  hand-authored additions converge on one list.
- **Build = the existing per-component run; "build all" = the batch run.** Keep
  both prompts. Per-row Build runs one; "Build all detected" runs the remaining
  unbuilt set. These are the current `buildOne`/`buildAll`, surfaced from the
  roster instead of a one-shot stage.
- **Verify is per-component + a batch action.** Each built component gets a
  Verify action (runs `/visual-verify` scoped to it); a "Verify all built"
  action runs the batch. Status flows back onto the roster from the reports. The
  old single gated verify stage is retired as a required step.
- **Foundation is a one-time prerequisite that collapses.** Until tokens +
  `components.json` exist, the workspace shows the foundation setup (today's
  design-system stage). Once present, it collapses to a status header
  (source · N tokens · N components · re-extract). Re-extract re-runs it.
- **Outputs are actions, not stages.** Manifest = a card that opens/generates the
  Design Manifest screen and shows staleness ("N components added since the
  approved manifest"). Publish = an optional card ("connect a repo…"), reusing
  `setPublishTarget` + the commit skill; never terminal, never gating.
- **Flow state stops encoding "complete."** `DEFAULT_FLOW`/`flow.json` are
  simplified: foundation (gated, one-time) + the continuous component/verify/
  manifest/publish actions no longer modeled as sequential required gates.
  `flow-manager` keeps the manifest approval record and the publish target;
  progress is reported as counts, not "N of M complete." Migration: existing
  `flow.json` reconciles forward (unknown legacy stages ignored; foundation
  status inferred from files).
- **The rail keeps its shared `projectRailItems`; "Flow" now opens the workspace.**
  No new nav slot — the workspace *is* the Flow destination.

## Risks / Trade-offs

- **Biggest change to the app's core screen.** Mitigate by reusing the inspector
  reader for status and the existing run prompts, and by shipping the roster
  first (foundation + build/verify) before the describe-new and outputs polish.
- **Legacy `flow.json` migration.** Reconcile forward and derive foundation
  status from files, so an in-progress project opens sensibly. Cover with a
  flow-manager test.
- **Losing the "you're done" signal.** Some users like a finish line. Replaced by
  clear living status + an explicit, optional "Publish when ready" — arguably a
  better fit, and the manifest approval still marks a meaningful milestone.
- **Describe-new correctness.** A new component must land in `components.json`
  *and* build; if the build fails, the entry still exists as "detected" so it is
  visible and retryable (no silent loss).
- **Verify cost.** Per-component verify spends usage; make it explicit per-row /
  batch actions the user triggers, never automatic.
