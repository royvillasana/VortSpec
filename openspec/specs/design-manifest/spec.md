# design-manifest Specification

## Purpose
TBD - created by archiving change add-design-manifest-and-assistant. Update Purpose after archive.
## Requirements
### Requirement: Generate the design manifest via the design-doc skill
The system SHALL generate `DESIGN.md` by invoking the SDD-DE `design-doc` skill
through the user's Claude Code (which drives `@google/design.md`), never by
authoring the manifest content itself. The run SHALL execute with the project as
its working directory and its progress SHALL be observable in the run panel.

#### Scenario: Generate when no manifest exists
- **WHEN** the user opens the Design manifest stage for a project that has components and Storybook but no `DESIGN.md`
- **THEN** the system starts a Claude Code run of the `design-doc` skill scoped to the project, streams its progress, and on completion reads the produced `DESIGN.md` and shows it in the rendered view

#### Scenario: Regenerate an existing manifest
- **WHEN** the user clicks Regenerate on an existing manifest
- **THEN** the system snapshots the current `DESIGN.md` as a version, re-runs the `design-doc` skill, and refreshes the view with the new content

#### Scenario: Generation fails
- **WHEN** the `design-doc` run exits with an error (e.g. `@google/design.md` cannot install or validate)
- **THEN** the system surfaces the run output as an actionable message and does not advance the stage

### Requirement: Locate and read the manifest from project files
The system SHALL resolve the manifest path by checking `DESIGN.md`, then
`.sdd-de/design.md`, then `design.md`, remember the resolved path, and display it
in the header. Manifest content SHALL be read from the file on disk (no cached IR).

#### Scenario: Root DESIGN.md present
- **WHEN** the project has `DESIGN.md` at its root
- **THEN** the system reads and displays it and shows `DESIGN.md` as the manifest path

#### Scenario: No manifest yet
- **WHEN** none of the candidate paths exist
- **THEN** the screen shows an empty state offering to generate the manifest

### Requirement: Rendered and markdown views
The system SHALL present the manifest in a Rendered view (styled markdown —
tokens, component contracts, conventions) and a Markdown view (line-numbered raw
source), toggled from the header, and SHALL let the user copy the markdown to the
clipboard and download the file.

#### Scenario: Toggle to markdown view
- **WHEN** the user selects the Markdown view
- **THEN** the system shows the raw manifest source with line numbers and a file bar

#### Scenario: Copy markdown
- **WHEN** the user clicks Copy
- **THEN** the full manifest markdown is written to the clipboard and a confirmation is shown

### Requirement: Edit the manifest (gated write)
The system SHALL allow the user to edit the raw manifest source and save it back
to the manifest file. Every save SHALL first snapshot the prior content as a
version, so an edit can be reverted.

#### Scenario: Save an edit
- **WHEN** the user edits the manifest source and saves
- **THEN** the system snapshots the previous content, writes the new content to the manifest path, and refreshes the views

### Requirement: Version management
The system SHALL snapshot `DESIGN.md` on each successful generate/regenerate,
each edit-save, and each approval, storing versions as plain files under
`.vortspec/manifests/` with metadata (timestamp, run id, approved flag). The
screen SHALL list versions and allow viewing and restoring a prior version.

#### Scenario: List versions
- **WHEN** the user opens the version list
- **THEN** the system shows each snapshot with its timestamp and whether it was an approved version

#### Scenario: Restore a version
- **WHEN** the user restores a prior version
- **THEN** the system snapshots the current content, writes the selected version back to the manifest path, and refreshes the views

### Requirement: Gated approval unlocks Publish
The manifest stage SHALL be gated: nothing advances until the user approves. On
approval the system SHALL record the stage approval in flow state, snapshot an
approved version, and reveal the path to Publish.

#### Scenario: Approve the manifest
- **WHEN** the user clicks Approve manifest
- **THEN** the system records the approval, snapshots an approved version, and shows the confirmation with a Publish action

#### Scenario: Publish gated before approval
- **WHEN** the manifest has not been approved
- **THEN** the Publish step for the manifest artifact is not reachable from this stage

