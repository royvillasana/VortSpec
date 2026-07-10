## Why

The SDD-DE pipeline **begins** with an **Intake** (the CLI's opening questions → `intake.json`) and a **Design-system Foundation** (read the source, **extract tokens + detect components** — the base everything is built from). The **cockpit** runs this: Create → Intake wizard → the actionable "Set up the foundation → Extract tokens & detect components" screen (`apps/desktop`).

The **IDE does not.** Its "Flow" activity (`PipelinePanel`) is, by its own docstring, "a read-first surface" — it lists the stages with status dots and "Open →" links but has **no intake, no foundation action, and no way to activate the pipeline.** And after a project is created in the IDE, the user is dropped in the **Explorer** — nothing kicks off the foundation. So a project created in the IDE has no design system and no obvious way to start one, breaking parity with the cockpit and the CLI (invariant: *same steps as the CLI*).

Both `Intake.tsx` and `GuidedFlow.tsx` already depend **only** on shared packages (`@vortspec/core`, `@vortspec/ui`), so they can be promoted to `@vortspec/ui` and reused verbatim in the IDE — **no change to the SDD-DE pipeline itself.**

Separately, once a foundation exists, a user often gets **more** design source later — a second Figma file, or a zip/folder of new components. Today re-running the foundation is either impossible (IDE) or ambiguous (does it replace or add?). Users need to **re-run the foundation against an additional source** and be **asked whether to clean-sweep (replace) or merge (add)** into the existing system.

## What Changes

- **Promote `Intake` and `GuidedFlow` to `@vortspec/ui`** (add a `hideRail` prop to `GuidedFlow`, like the other embedded panels). The cockpit imports them from the new home — **no behavior change** for the cockpit. One source of truth guarantees IDE↔cockpit parity.
- **The IDE "Flow" activity renders the actionable `GuidedFlow`** (with `hideRail`) instead of the read-only `PipelinePanel`. `PipelinePanel` is retired (or kept only as a compact status strip).
- **Auto-start the intake → foundation pipeline** in the IDE for **new *and* un-founded** projects:
  - After **Create New Project** → **Intake** → **Foundation**, auto-sequenced exactly like the cockpit.
  - **Opening any project whose foundation isn't set up yet** (no extracted tokens/components) lands on **Flow/foundation**, not the Explorer.
  - Once the foundation exists, the IDE defaults to the Explorer; Flow stays reachable.
- **Re-runnable foundation with additive re-sourcing:** the Foundation can be pointed at an **additional source** (a second Figma file; a zip/folder of components as a fast-follow). When the project **already has a design system**, VortSpec asks:
  - **Clean sweep** — re-extract from the new source, **replacing** the current tokens + components.
  - **Merge / Add** — additively bring the new source's tokens + components **into** the existing system, deduped **by name** (existing kept, new added, value-conflicts on the same name **flagged**, never silently overwritten).
  - VortSpec only **chooses the mode + passes the source**; it maps to the **existing** SDD-DE prompts (clean-sweep → the fresh source-extract prompt; merge → the existing additive re-scan/reconcile prompt). No pipeline change.

## Capabilities

### New Capabilities
- `ide-guided-flow`: the IDE's Flow activity becomes the actionable guided flow — the same `Intake` + `GuidedFlow` the cockpit uses, embedded with `hideRail`, with the IDE's post-create/auto-start routing so the intake → foundation pipeline begins automatically for new and un-founded projects.
- `foundation-resourcing`: re-run the design-system foundation against an additional source with an explicit **Clean sweep vs Merge** choice, mapped to the existing SDD-DE source-extract / additive-reconcile prompts (no methodology change).

### Modified Capabilities
<!-- Shared-view relocation only: Intake + GuidedFlow move to @vortspec/ui unchanged; the
     cockpit re-imports them. No requirement-level change to the SDD-DE flow definitions. -->

## Impact

- **`packages/ui`:** new `Intake` and `GuidedFlow` (moved from `apps/desktop`), exported via the package map; `GuidedFlow` gains a `hideRail` prop. A small `foundationReady` helper (tokens>0 || components>0).
- **`apps/desktop`:** import `Intake`/`GuidedFlow` from `@vortspec/ui` instead of local `./views/*` (no behavior change).
- **`apps/ide`:** the `flow` activity renders `GuidedFlow` (hideRail); `App.tsx` post-create routing (Create → Intake → Foundation) and open-project routing (un-founded → Flow, founded → Explorer); the `Intake` step surfaced for the IDE; retire/repurpose `PipelinePanel`.
- **`packages/core`:** the foundation re-source path — accept an additional source + a `mode: "replace" | "merge"` and select the corresponding SDD-DE prompt (reusing `FOUNDATION_DEF` / the additive re-scan prompt). No new IPC to the CLI beyond the existing agent-run path.
- **Invariants upheld:** Claude Code stays the engine (foundation is a gated run, unchanged); same steps as the CLI (intake + foundation now present in the IDE too); spec-first gate intact; local-first (all outputs land in the project's own token/component files); no methodology re-implementation (VortSpec only orchestrates mode + source).
- **Risk:** `GuidedFlow` is large (~1000 LOC) — the move must be a pure relocation (no logic edits) so parity is provable by diff. Merge conflicts on tokens/components are handled by the additive SDD-DE reconcile; VortSpec surfaces name-collision flags rather than resolving them itself.
