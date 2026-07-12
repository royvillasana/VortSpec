## ADDED Requirements

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
