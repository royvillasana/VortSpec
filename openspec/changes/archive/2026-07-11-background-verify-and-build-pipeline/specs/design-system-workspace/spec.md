# design-system-workspace

## ADDED Requirements

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
