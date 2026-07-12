# dev-preview Specification

## Purpose
TBD - created by archiving change pivot-to-desktop-cockpit. Update Purpose after archive.
## Requirements
### Requirement: Managed dev server

After implementation, VortSpec SHALL offer to run the project's dev environment, detected from the project's `package.json` scripts, in a managed PTY session.

#### Scenario: Dev environment detected and started

- **WHEN** implementation completes and the project has a recognizable dev script
- **THEN** VortSpec offers to run it and, on confirmation, starts the dev server in a managed PTY

### Requirement: Embedded preview with escape hatch

VortSpec SHALL render the running dev server's URL in an embedded preview panel and SHALL provide an "open in browser" escape hatch. Server logs SHALL be available in the terminal view.

#### Scenario: Preview renders

- **WHEN** the managed dev server reports a URL
- **THEN** VortSpec renders it in the embedded preview panel, offers open-in-browser, and exposes the server logs in the terminal view

#### Scenario: Server stopped cleanly

- **WHEN** the user stops the dev preview
- **THEN** the managed PTY process is terminated cleanly and the preview panel reflects the stopped state

