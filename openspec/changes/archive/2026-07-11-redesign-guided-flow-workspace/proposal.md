## Why

The Guided Flow screen models the SDD-DE cycle as a **linear pipeline that
terminates**: `design-system → components → visual-verify → sync →
design-manifest → commit`, "complete" once every non-optional stage is approved.
That framing is wrong for a design system, which **grows over time**:

- The `components` stage is a **one-shot gate** — build all (or one-by-one) →
  Approve → it locks with "Components approved." There is **no path to add more
  components** afterward.
- Per-component "built" state lives only in a session `Set`, not derived from
  files, so it does not even persist across reopen.
- The flow declares itself **done**, and **commit/GitHub sits as the terminal
  step**, framing publishing as the goal — when it is optional and secondary.

The core value is: extract the design system, then **create one component or all
at once, and keep adding components** for the life of the project. The SDD-DE CLI
is already per-component and iterative (`generate-artifacts` → implement →
`visual-verify`, one component at a time), so making the UI continuous **aligns
better** with the methodology than the current one-time checklist.

Now, because real usage has hit exactly this wall — a completed flow with no
intuitive way to continue building the design system.

## What Changes

Reframe the Guided Flow from a linear, terminating flow into a **living Design
System workspace** with three zones:

- **Foundation** (one-time): design source → tokens → component detection.
  Collapses to a compact status header once done, with a re-extract action.
- **Components** (the centerpiece, never "complete"): a **roster** of every
  component with real, file-derived status — *detected / built / verified /
  has-issues*. An always-present **Add components** control: build all detected,
  build selected, or **create a brand-new component** by describing it (name +
  intent → Claude Code generates it into the system). Per-row actions: build,
  verify, open in Playground, modify.
- **Outputs** (on-demand, optional): generate/regenerate the **design manifest**
  (`design.md`) anytime, surfacing "N components added since last"; and an
  **optional Publish** ("connect a repo when you're ready to build screens"),
  de-emphasized — no terminal "complete."

The "flow complete" concept is dropped in favor of living status
("Foundation ready · 8/11 built · 5 verified"). Spec-first gates are preserved:
building/modifying still produce reviewable artifacts, and the manifest keeps its
approval gate before it is the official hand-off.

## Capabilities

### New Capabilities
- `design-system-workspace`: the reframed project screen (the "Flow" destination) — foundation status, a continuous component roster (per-component status + add/build/verify/modify, incl. describe-new), and on-demand outputs (manifest, optional publish). No linear "complete" terminal state.

### Modified Capabilities
<!-- None: the workspace replaces the Flow screen's behavior and is fully captured
     by the new design-system-workspace capability. The rail/nav (app-shell) is
     unchanged — "Flow" simply opens the workspace. -->


## Impact

- Renderer: rewrite `GuidedFlow.tsx` into the workspace (foundation header,
  component roster, add-components menu incl. new-component, outputs section);
  retire the completion banner + linear timeline gating.
- Main/shared: component roster status derived from files (component sources +
  `visual-verify` reports), not a session Set; a "detect/add a new component"
  path that appends to `.sdd-de/components.json`; flow state stops encoding a
  terminal "complete" and instead reflects per-component progress. Verify becomes
  per-component + a batch action; sync/manifest/publish become on-demand.
- Invariants honored: Claude Code is the engine (build/verify/manifest all run
  the real skills); same SDD-DE steps (per-component generate-artifacts →
  implement → visual-verify); spec-first gates before mutations advance; local-
  first (roster status is derived from project files); publish stays opt-in.
