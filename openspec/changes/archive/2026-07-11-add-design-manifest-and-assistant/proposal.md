## Why

Once the SDD-DE flow has built components and set up Storybook, the next real
step in the methodology is the **design manifest** — a `DESIGN.md` that captures
the whole design system (tokens, component contracts, conventions) as a hand-off
file any AI coding agent can read to build on-brand screens without re-deriving
the system. The methodology already has this: the **`design-doc`** skill drives
Google's **`@google/design.md`** CLI to generate and validate `DESIGN.md`, run
after `/storybook` and before screen creation. VortSpec's guided flow stops at
Verification and never surfaces this stage, so the user has no in-app way to
generate, review, version, or approve the manifest — the single most important
artifact for downstream AI work.

Separately, the Claude Design mockups the user is driving toward include a
**persistent assistant chat** available across the cockpit (talk to Claude Code
about the project from any screen), and a consistent dark **background treatment**
that the current app only partially matches. Both are requested alongside the
manifest work.

Now, because real usage has reached the point where components + Storybook exist
and the manifest is the actual next step.

## What Changes

- Add a **Design manifest** stage to the guided flow (after Verification, before
  Publish), gated for approval, producing `DESIGN.md`. "Generate" invokes the
  `design-doc` skill through Claude Code — the engine writes and validates the
  file; VortSpec configures, observes, and gates.
- Add a **Design Manifest screen** (per `Design Manifest.dc.html`): a **Rendered**
  view (styled markdown — tokens, component contracts, conventions) and a
  **Markdown** view (line-numbered raw source), with **Copy**, **Download**,
  **Regenerate**, inline **Edit** (gated write), and the gated **Approve** action
  that records approval and unlocks Publish.
- Add **manifest version management**: each generated/approved `DESIGN.md` is
  snapshotted locally; the screen lists versions and can view/restore a prior one.
- Add a **global assistant dock**: a persistent chat panel, toggled from the top
  bar, available on every project screen, that talks to the user's Claude Code
  about the project (resumable session; local-first; no new provider access).
- **Background/visual alignment**: audit screens against the design's exact dark
  values and fix mismatches, including the Storybook preview's white surround.

## Capabilities

### New Capabilities
- `design-manifest`: generate (via the `design-doc` skill), render/markdown-view, copy/download, edit, version, and gate-approve the project's `DESIGN.md`.
- `assistant-dock`: a persistent, project-scoped Claude Code chat available across every project screen.

### Modified Capabilities
- `app-shell`: the guided flow gains a Design-manifest stage between Verification and Publish, and the shell gains the assistant-dock toggle + a consistent background treatment.

## Impact

- Renderer: new `DesignManifest` view; a shared `AssistantDock`; a top-bar chat toggle; background-value fixes across views; nav gains the manifest destination.
- Main: new IPC for reading/writing/validating `DESIGN.md`, listing/reading/restoring manifest versions; a `design-doc` run wrapper; flow gains the `design-manifest` stage in `DEFAULT_FLOW`.
- Skills/CLI: depends on the `design-doc` skill and `@google/design.md` (installed per project on demand, like Storybook).
- Invariants honored: Claude Code is the engine (VortSpec never authors `DESIGN.md`); spec-first gate before the manifest advances; local-first (manifest + versions are plain files in the project); the user's own Claude for the assistant (resumable session, no keys, no telemetry).
