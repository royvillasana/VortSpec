# design-system-index Specification

## Purpose
Precomputed, committed artifacts describing what the design system contains and how its parts relate — the component roster, the `uses`/`usedBy` relationship graph, and the token→consumer reverse index. Exists so an agent can ANSWER questions about the system instead of rediscovering it by reading source files on every run.

## Requirements
### Requirement: The index records component relationships
The system SHALL build a relationship index of the project's components recording, for each
component, the components it renders (`uses`) and the components and pages that render it
(`usedBy`). Chains SHALL be resolved recursively, so the atoms reached through intermediate
molecules and organisms are derivable without reading any source file.

#### Scenario: Reverse edges exist
- **WHEN** `Nav` renders `Link` and `Header` renders `Nav`
- **THEN** `Link.usedBy` SHALL include `Nav`
- **AND** `Nav.usedBy` SHALL include `Header`

#### Scenario: Recursive descent reaches atoms
- **WHEN** an agent asks which atoms a page uses and the page renders only `Header`
- **THEN** the index SHALL yield `Link` through the `Header` → `Nav` → `Link` chain
- **AND** no page or component source file SHALL be read to answer it

### Requirement: Index entries are keyed on full project-relative paths
Every index entry SHALL be keyed on the component's full project-relative path, never on its
filename stem. Two files sharing a basename SHALL produce two distinct entries.

#### Scenario: Same basename does not collide
- **WHEN** the project contains both `src/pages/index.astro` and `src/pages/skills/index.astro`
- **THEN** the index SHALL contain two entries
- **AND** neither SHALL overwrite the other

### Requirement: Adoption is measured by instances, not imports
The index SHALL record per component an `importCount` (files that import it), an `instanceCount`
(occurrences of the component's tag in template bodies), and an `efficiency` ratio of instances to
importing files. Instance counting SHALL account for composition depth, conditional rendering, and
loops, and SHALL NOT double-count instances nested inside a slot of an already-counted component.

#### Scenario: Imported but never rendered
- **WHEN** a component is imported by one file but never rendered in its template
- **THEN** `importCount` SHALL be 1 and `instanceCount` SHALL be 0
- **AND** the component SHALL be reported as unused

#### Scenario: Slot nesting is not double-counted
- **WHEN** a `Button` instance is passed into a `Card` slot and `Card` is rendered once
- **THEN** that `Button` SHALL contribute exactly one instance

### Requirement: The index detects shadow implementations
The system SHALL flag markup that reproduces a design-system component's structure without
importing it — a component bypassed by hand-rolled equivalent markup. A shadow implementation
SHALL name the component it shadows and the file it occurs in.

#### Scenario: Hand-rolled button is flagged
- **WHEN** a page contains a styled `<button>` matching `Button`'s structure and token usage but
  does not import `Button`
- **THEN** a shadow-implementation finding SHALL be produced naming `Button` and that file

### Requirement: Index artifacts are persisted and token-efficient
The index SHALL be persisted to `.vortspec/ai/index.toon` (inventory),
`.vortspec/ai/component-usage.toon` (relationships and counts), and
`.vortspec/ai/design-tokens.toon` (each token mapped to the components that consume it), in TOON.
Each artifact SHALL carry a `generatedAt` stamp.

#### Scenario: Artifacts written on build
- **WHEN** the index is built for a project
- **THEN** the three artifacts SHALL exist under `.vortspec/ai/` with a `generatedAt` stamp

#### Scenario: Token reverse lookup
- **WHEN** an agent asks which components consume `color/brand/primary`
- **THEN** `design-tokens.toon` SHALL answer without scanning component sources

### Requirement: The index is built in-process without new runtime dependencies
The index SHALL be built in TypeScript within the application, reusing the existing component scan
cache and the shared framework profile table so that a framework already supported by the project
is indexed without further configuration. Building the index SHALL NOT require Python or any other
interpreter beyond the application's own runtime.

#### Scenario: No interpreter requirement
- **WHEN** the index is built on a machine with no Python installed
- **THEN** the build SHALL succeed

#### Scenario: Framework coverage follows the profile table
- **WHEN** a framework is present in the shared framework profile table
- **THEN** its source extensions and import forms SHALL be indexed without a separate
  per-framework configuration file

### Requirement: Runs receive relationships through the digest
The design-system digest prepended to grounded runs SHALL include a bounded relationship section
in addition to the inventory, and SHALL expose an on-demand lookup for a component's `uses` and
`usedBy` so that a run pays for the full graph only when it needs it. The digest SHALL remain
bounded regardless of design-system size and SHALL stay wrapped in a data-not-instructions block
with every field sanitized.

#### Scenario: Digest stays bounded
- **WHEN** the digest is built for a project with more components than the digest bound allows
- **THEN** the digest SHALL be truncated to the bound
- **AND** the truncation SHALL be stated in the digest rather than silent

#### Scenario: Graph available without full cost
- **WHEN** a run needs `usedBy` for one component
- **THEN** it SHALL be able to request that component's relationships without loading the full
  relationship artifact

### Requirement: Index staleness is detectable
The system SHALL report the index as stale when the component directory has changed since the
index's `generatedAt` stamp, and SHALL expose that state to both the UI and continuous
integration.

#### Scenario: Component added after indexing
- **WHEN** a component file is added after the index was generated
- **THEN** the index SHALL be reported as stale

#### Scenario: CI fails on a stale index
- **WHEN** continuous integration runs against a stale index
- **THEN** the check SHALL fail and name the components that are missing from it
