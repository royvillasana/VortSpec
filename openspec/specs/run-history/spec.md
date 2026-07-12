# run-history Specification

## Purpose
TBD - created by archiving change pivot-to-desktop-cockpit. Update Purpose after archive.
## Requirements
### Requirement: Runs recorded locally as plain files

VortSpec SHALL record every run locally as plain files under the project (e.g. `.vortspec/runs/`), capturing stages, timestamps, artifacts produced, approval decisions, and outcome. Storage SHALL be git-ignorable by user choice.

#### Scenario: A run is recorded

- **WHEN** a run completes (or is cancelled)
- **THEN** VortSpec writes a plain-file record of its stages, timestamps, artifacts, approval decisions, and outcome into the project's runs directory

### Requirement: History timeline

VortSpec SHALL present recorded runs as a browsable timeline, reusing the v1 history visual language.

#### Scenario: User browses history

- **WHEN** the user opens the history view
- **THEN** past runs render as a timeline showing stages, decisions, and outcomes, each openable for detail

