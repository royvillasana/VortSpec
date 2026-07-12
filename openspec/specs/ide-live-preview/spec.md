# ide-live-preview Specification

## Purpose
TBD - created by archiving change vortspec-ide. Update Purpose after archive.
## Requirements
### Requirement: Live preview paired with the editor
The IDE SHALL show a live preview pane paired with the editor, realizing "screens on one side, code on the other." The preview SHALL embed the existing app/Storybook runtime for the open workspace.

#### Scenario: Preview beside the code
- **WHEN** the user is editing files in a workspace that has a runnable app or Storybook
- **THEN** the live preview pane renders that running surface alongside the editor

#### Scenario: Toggle layout
- **WHEN** the user toggles the preview arrangement
- **THEN** the preview switches between stacked (below the editor) and side-by-side without losing editor state

### Requirement: Preview runtime reuses the shared dev-server
The preview SHALL start/stop through the shared dev-server in `packages/core`, keyed by project and server kind, so it does not double-start a server already running for that project.

#### Scenario: No double-start
- **WHEN** a dev/app server is already running for the workspace
- **THEN** the preview attaches to the existing server rather than starting a second one

#### Scenario: Start on demand
- **WHEN** no server is running and the user opens the preview
- **THEN** the IDE starts the appropriate server (app or Storybook) for the workspace and embeds its URL

### Requirement: Preview reflects saved edits
The preview SHALL reflect changes as the workspace's dev-server hot-reloads, so edits made in the editor become visible in the preview.

#### Scenario: Edit reflects in preview
- **WHEN** the user saves a change that the dev-server hot-reloads
- **THEN** the preview updates to show the change without a manual full restart

