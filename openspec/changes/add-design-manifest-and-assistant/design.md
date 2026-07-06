## Context

VortSpec is an Electron cockpit over the user's local Claude Code driving the
SDD-DE cycle. The guided flow (`shared/flow.ts` → `DEFAULT_FLOW`, persisted to
`.vortspec/flow.json`, rendered by `GuidedFlow.tsx`) currently ends at
Verification. The methodology's next step is the **design manifest**: the
`design-doc` skill runs `@google/design.md` to produce and validate a `DESIGN.md`
at the project root, after `/storybook` and before screen creation.

The Claude Design mockup `Design Manifest.dc.html` specifies the screen: a
rendered/markdown toggle, a line-numbered source view, copy/download, regenerate,
and a gated Approve bar (review → regenerating → approved → Publish). The design
set also uses a consistent dark palette (`#0B0C0E` main, `#141518` panels,
`#08090B` code, `#26282D` borders, `#7C6FF0` accent) and the user wants a
persistent assistant chat across the cockpit.

Existing seams to reuse: `useAgentRun`/`RunPanel` (resumable Claude Code chat +
tabbed run view), the managed-run recorder, the artifact-gate pattern from
`ArtifactReview`, the shared `ProjectRail`, the Markdown renderer component, and
the flow-manager gate/approval plumbing.

## Goals / Non-Goals

**Goals:**
- A Design-manifest flow stage (gated) that generates `DESIGN.md` via the
  `design-doc` skill and records approval before Publish is reachable.
- A Design Manifest screen matching the mockup: rendered + markdown views, copy,
  download, regenerate, inline edit (gated write), approve.
- Local version history of `DESIGN.md` with view/restore.
- A persistent, project-scoped assistant dock available on every project screen.
- Background/visual alignment to the design's exact values, incl. the Storybook
  preview surround.

**Non-Goals:**
- Re-implementing `@google/design.md` or the manifest content logic — Claude Code
  + the skill own it.
- A general multi-project or multi-session chat history store (one resumable
  session per project is enough for now).
- Rich markdown WYSIWYG editing — edit is a raw-source textarea with a gated save.
- Diffing UI between manifest versions in v1 (restore only; diff is a follow-up).

## Decisions

- **Generation = the `design-doc` skill, not a bespoke prompt.** The stage runs
  `/design-doc` (or the skill's canonical invocation) through `useAgentRun` with
  `bypassPermissions` so `@google/design.md` and file writes proceed headless,
  cwd confined to the project. VortSpec parses the run for completion, then reads
  the file. This keeps "Claude Code is the engine" intact and stays in lockstep
  with the CLI methodology.
- **Manifest location: prefer what the skill writes.** The `design-doc` skill
  writes `DESIGN.md` at the project root. The reader resolves the manifest by
  checking `DESIGN.md` then `.sdd-de/design.md` (mockup label) then `design.md`,
  and remembers which. The header shows the real relative path.
- **Rendering is file-derived, no IR.** The rendered view parses the manifest's
  own markdown (reusing the dependency-free Markdown renderer) — headings,
  tables, lists, code — rather than a structured model. Markdown view is the raw
  source, line-numbered, matching the mockup.
- **Versions are plain files.** On each successful generate/regenerate and on
  approve, snapshot the current `DESIGN.md` to `.vortspec/manifests/<iso>.md`
  with a small `index.json` (timestamp, run id, approved flag). List/read/restore
  over new IPC. Local-first and inspectable; restore is a gated write back to the
  manifest path.
- **Edit + approve are gated writes.** Inline edit saves to the manifest path
  (snapshotting first). Approve records the stage approval in flow state (same
  mechanism as other gates) and snapshots an `approved` version. Nothing advances
  to Publish without the recorded approval.
- **Assistant dock reuses `useAgentRun`.** A single shared `AssistantDock`
  (right-side, top-bar toggle, persisted open/closed) holds a resumable Claude
  Code session scoped to the active project's cwd, reusing the existing chat send
  path. It is app-shell-level so it overlays every project screen. On the manifest
  screen, "refine via chat" is simply the dock pre-seeded to talk about `DESIGN.md`.
- **Background alignment via tokens.** The `--color-vs-*` tokens already encode
  the palette; fix the specific offenders (e.g. the Playground/Storybook white
  surround, any panel using an off value) rather than restyle globally. The
  Storybook iframe keeps its own white canvas (that's the component surface) but
  its VortSpec frame/letterboxing uses `vs-bg-primary`.

## Risks / Trade-offs

- **`@google/design.md` availability / interactivity.** Like `storybook init`,
  the first run installs a dep and may be slow; the skill handles install. Surface
  progress in the run panel; if the CLI errors, show the run output as a fix-it,
  don't hang. Mitigated by the same auto-run + timeout patterns used for Storybook.
- **Manifest path drift (root vs `.sdd-de`).** Resolved by a defined lookup order
  and storing the resolved path; the reader tolerates either.
- **Assistant dock spends Claude usage.** It only starts a session on first user
  send (not on mount), mirroring the "verify login on first use" rule — no
  background usage.
- **Global dock vs. screen real estate.** The dock is collapsible and off by
  default; state persists per session so it never surprises the user.
- **Markdown rendering fidelity.** The lightweight renderer may not cover every
  construct `@google/design.md` emits (e.g. YAML frontmatter). Frontmatter is
  rendered as a compact metadata strip; unknown blocks fall back to monospace.
