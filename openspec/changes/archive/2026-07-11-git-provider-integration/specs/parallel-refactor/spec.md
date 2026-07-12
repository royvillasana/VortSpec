# parallel-refactor

## ADDED Requirements

### Requirement: Non-destructive parallel refactor of existing screens
The app SHALL re-implement the repo's existing screens against the new token-driven
components — using the VortSpec-built design system (tokens + components + Storybook +
DESIGN.md) — as duplicated, parallel files, never modifying, moving, or deleting the originals.

#### Scenario: Duplicate screens against the new system
- **WHEN** the user runs the refactor on a scanned repo whose design system has been built
- **THEN** each existing screen gets a NEW parallel implementation composed from the new
  components, written as new files in a separated namespace (route tree / sibling file /
  build flag), and the original files are byte-for-byte unchanged

#### Scenario: Old and new coexist; the team owns the cutover
- **WHEN** the refactor is delivered
- **THEN** the old and new implementations coexist, VortSpec never removes or overwrites
  the old code, and disconnecting the old / connecting the new is a deliberate human step

### Requirement: Refactor is gated and additive
The refactor SHALL be delivered behind the spec-first gate on a new branch + PR, honoring
the no-delete / no-overwrite git guardrail, with a migration map.

#### Scenario: Delivered as a reviewable PR
- **WHEN** the user publishes the refactor
- **THEN** it lands on a new branch as a PR (no branch deletion, no force-push, no
  overwrite of originals) and includes a `MIGRATION.md` mapping each old screen → its new
  duplicate with the switch-over steps

#### Scenario: Gate before refactor
- **WHEN** the design system artifacts have not been approved at the flow gate
- **THEN** the refactor action is unavailable until approval is recorded
