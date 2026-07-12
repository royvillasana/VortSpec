# design-system-workspace

## ADDED Requirements

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
