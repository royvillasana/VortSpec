# design-system-workspace Specification

## Purpose
TBD - created by archiving change redesign-guided-flow-workspace. Update Purpose after archive.
## Requirements
### Requirement: Foundation is a one-time prerequisite that collapses
The workspace SHALL require the design foundation (design source → tokens →
component detection) once. Until the token file and `.sdd-de/components.json`
exist, the workspace SHALL present the foundation setup. Once they exist, the
foundation SHALL collapse to a compact status header (source, token count,
detected count) with a re-extract action, and SHALL NOT block the component work.

#### Scenario: Foundation not yet established
- **WHEN** the project has no extracted tokens or component inventory
- **THEN** the workspace shows the foundation setup (connect source, extract tokens, detect components)

#### Scenario: Foundation established
- **WHEN** the token file and `.sdd-de/components.json` exist
- **THEN** the foundation is shown as a compact status header with a re-extract action, and the component roster is the focus

### Requirement: Continuous component roster with file-derived status
The workspace SHALL show a roster of every component from
`.sdd-de/components.json` and the generated source, each with a status derived
from the project's files — detected (no source yet), built (source present),
verified, or has-issues (from the visual-verify report). Status SHALL persist
across sessions because it is read from disk, never from transient run state.

#### Scenario: Roster reflects real status
- **WHEN** the workspace opens
- **THEN** each component shows detected / built / verified / has-issues based on its source file and visual-verify report

#### Scenario: Status persists across reopen
- **WHEN** the user builds a component, closes the project, and reopens the workspace
- **THEN** that component still shows as built (status came from files, not a session)

### Requirement: Add components at any time
The workspace SHALL always offer an "Add components" action that can: build every
still-unbuilt detected component, build a selected subset, or create a brand-new
component by describing it (name + intent). Adding SHALL be available regardless
of how many components already exist — the design system is never "complete."

#### Scenario: Build all remaining detected components
- **WHEN** the user chooses "build all detected"
- **THEN** Claude Code builds each not-yet-built component (generate-artifacts → implement), and the roster updates as each completes

#### Scenario: Build a single component from the roster
- **WHEN** the user builds one detected component from its row
- **THEN** only that component is generated and its row updates to built

#### Scenario: Create a brand-new component
- **WHEN** the user describes a new component (name + intent) and confirms
- **THEN** the system appends it to `.sdd-de/components.json` and builds it; if the build fails, the entry remains as a detected/unbuilt row so it is visible and retryable

### Requirement: Per-component and batch verification
The workspace SHALL let the user run visual verification per built component and
as a batch over all built components, running the real `visual-verify` skill.
Verification SHALL NOT run automatically (it spends usage); results SHALL surface
on the roster as verified / has-issues.

#### Scenario: Verify one component
- **WHEN** the user verifies a built component
- **THEN** `visual-verify` runs scoped to it and its row shows verified or has-issues from the report

#### Scenario: Verify all built
- **WHEN** the user runs "verify all built"
- **THEN** verification runs over the built components and each row reflects its result

### Requirement: On-demand outputs, no terminal completion
The workspace SHALL present the manifest and publish as on-demand actions, not as
sequential required stages, and SHALL NOT declare the flow "complete." The
manifest action SHALL let the user generate/regenerate `DESIGN.md` and SHALL
indicate staleness (components added since the last approved manifest). Publish
SHALL be optional and de-emphasized (connect a repo when ready), never gating.

#### Scenario: Regenerate the manifest after adding components
- **WHEN** components have been added since the last approved manifest
- **THEN** the outputs section indicates the manifest is stale and offers to regenerate it

#### Scenario: Publish is optional
- **WHEN** the user has not connected a GitHub repo
- **THEN** the workspace still functions fully and shows publish as an optional "connect when ready" action, with no completion gate blocked on it

### Requirement: Living progress status
The workspace SHALL report progress as living counts (e.g. built/total, verified
count) rather than an "N of M stages complete / done" state.

#### Scenario: Progress reads as counts
- **WHEN** some components are built and some verified
- **THEN** the header shows a living status such as "Foundation ready · 8/11 built · 5 verified", not "complete"

### Requirement: Rich per-component Storybook docs
The app SHALL generate rich per-component documentation pages in Storybook that
match the reference component-doc structure, additively.

#### Scenario: Sync docs generates missing pages
- **WHEN** the user runs "Sync docs"
- **THEN** shared doc blocks are created once, and a `<Component>.mdx` docs page is
  generated for each component that lacks one, in the section order: live preview,
  Component Identity, Props, Common Patterns, Anti-Patterns, States & Behaviour,
  Accessibility, Design Tokens, AI Generation Hints, Stories

#### Scenario: Additive and non-destructive
- **WHEN** some components already have a docs page
- **THEN** those are left untouched and only the missing ones are generated;
  component source and existing stories are never modified

#### Scenario: Figma metadata enrichment
- **WHEN** the project's design source is Figma
- **THEN** the docs data is enriched via `figma_generate_component_doc` (anatomy,
  per-variant tokens, content guidelines, annotations, parity); otherwise the docs
  are composed from the component specs + source only

### Requirement: Storybook stays in sync as components grow
Story generation SHALL be additive and idempotent so components built after the
initial Storybook setup can be added without overwriting existing stories.

#### Scenario: Generate missing stories
- **WHEN** the user syncs Storybook and some components lack a `.stories.tsx`
- **THEN** a story is generated only for each component missing one, and existing
  stories are left untouched

### Requirement: DESIGN.md is the validated Google format
Generating the design manifest SHALL produce a `@google/design.md`-format
`DESIGN.md` that passes `npx @google/design.md lint` with zero errors and covers
every built component with usage examples and Storybook links.

#### Scenario: Generate produces the Google format
- **WHEN** the user generates the manifest
- **THEN** `DESIGN.md` has YAML frontmatter (name/colors/typography/rounded/spacing/
  components) and a `## Components` prose section with per-component usage + Storybook
  URLs, and lints with zero errors

### Requirement: No filename collision; decisions log preserved as context
The token-decisions log and the Google-format DESIGN.md SHALL NOT collide on a
case-insensitive filesystem, and the decisions log SHALL inform the DESIGN.md.

#### Scenario: Relocate a decisions log before generating
- **WHEN** the root manifest is a token-decisions log (no YAML frontmatter)
- **THEN** it is moved to `.sdd-de/design-decisions.md` before `/design-doc` runs,
  and its deviations are folded into DESIGN.md's Design Decisions section

#### Scenario: Sync-tokens no longer clobbers DESIGN.md
- **WHEN** the app runs its sync-tokens stage
- **THEN** the decisions log is written to `.sdd-de/design-decisions.md`, not the root

### Requirement: Manifest format is surfaced
The app SHALL detect whether the manifest is the Google format and warn when it is
not, offering to regenerate.

#### Scenario: Warn on a non-Google manifest
- **WHEN** the manifest present is a decisions log rather than the Google format
- **THEN** the Design Manifest screen shows a warning with a regenerate action

### Requirement: Verify runs autonomously in the background
Verifying a component (one or all) SHALL run without asking the user to open a browser,
open Figma, start a server, or perform any checklist step. The app SHALL provision
everything the verify agent needs and present only the outcome.

#### Scenario: Verify a built component
- **WHEN** the user clicks Verify on a built component
- **THEN** the app ensures a render harness is running, launches an autonomous verify
  run, and shows a compact task card ("Verifying <name>…") — not the raw checklist
- **AND** on completion the card shows "✓ passed" or "⚠ N issues" from the report, with
  a "View details" affordance to the full transcript

#### Scenario: No manual steps surfaced
- **WHEN** a verify run executes
- **THEN** the app SHALL NOT present the visual-verify checklist as user to-dos, and the
  agent SHALL be instructed not to ask the user to perform steps

### Requirement: Build & verify the rest as one pipeline
After components are detected (including via a re-scan), the workspace SHALL offer a
single action that builds and verifies every not-yet-built component in the background,
per the CLI's Apply → Visual-Verify → Adversarial-Review sequence.

#### Scenario: Build & verify the rest
- **WHEN** the user clicks "Build & verify the rest"
- **THEN** each detected component is built and then verified in one background chain,
  sequentially, on the current branch
- **AND** a single summary reports how many were built & verified and how many need
  attention

#### Scenario: One-off actions remain
- **WHEN** the user wants to act on a single component
- **THEN** per-row Build and Verify remain available, and a "Build only (no verify)"
  option remains for building without the verify chain

### Requirement: Reconnect and prevent duplicate runs
The workspace SHALL reflect an in-flight run when re-mounted and SHALL prevent starting a
second concurrent run on the same project.

#### Scenario: Return during a run
- **WHEN** the user navigates away during a build/verify and returns to the workspace
- **THEN** the workspace shows the in-flight run's live status and the correct task card

#### Scenario: Start disabled while running
- **WHEN** a run is in progress
- **THEN** Build, Verify, Re-scan, and pipeline start actions are disabled with a hint

