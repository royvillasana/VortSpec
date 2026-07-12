# git-design-source Specification

## Purpose
TBD - created by archiving change git-provider-integration. Update Purpose after archive.
## Requirements
### Requirement: GitHub as a design source (pull in)
Setup SHALL let the user pick a GitHub repository as the design source; the app clones or
pulls it into the project folder on the chosen branch.

#### Scenario: Choose a repo at setup
- **WHEN** the user selects GitHub as the design source and provides a repo + branch
- **THEN** the app clones/pulls it into the project folder and records it in project config

### Requirement: Scan a repo and build the design system locally
The app SHALL scan the pulled repository for design tokens and components and build them
in the selected framework and language using the SDD-DE pipeline.

#### Scenario: Repo → built design system
- **WHEN** the design source is a GitHub repo
- **THEN** the source-driven pipeline extracts tokens and detects components from the
  repo's files and builds them locally in the configured framework/language, exactly as
  the Figma flow does with the repo as the source of truth

### Requirement: Push the generated system back (gated)
After the spec-first gate, the app SHALL push the generated tokens/components/manifest
back to the provider on a new branch it creates or a branch the user selects, opening a PR.

#### Scenario: Push back on a new branch with a PR
- **WHEN** the user publishes the built design system
- **THEN** the app creates a branch (or uses the chosen one), stages + commits the
  generated artifacts, pushes, and opens a PR — never a silent push to `main`

#### Scenario: Gate before publish
- **WHEN** the artifacts have not been approved at the flow gate
- **THEN** the push-back action is unavailable until approval is recorded

