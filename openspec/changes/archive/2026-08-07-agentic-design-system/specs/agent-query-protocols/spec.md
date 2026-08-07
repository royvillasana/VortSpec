## ADDED Requirements

### Requirement: Generated rules teach the agent to navigate the index
The system SHALL generate project-scoped rule documents under `.vortspec/ai/rules/` covering: the
metadata schema contract, the atomic hierarchy and its dependency direction, the deep-tracing
method for recursive `uses` traversal, and load-once discipline. These rules SHALL be referenced
from grounded runs so an agent resolves design-system questions by querying the index rather than
by traversing the filesystem.

#### Scenario: Rules are generated with the index
- **WHEN** the design-system index is built for a project
- **THEN** the rule documents SHALL exist under `.vortspec/ai/rules/`

#### Scenario: A run is told how to query
- **WHEN** a grounded run starts
- **THEN** its prompt SHALL reference the rule documents alongside the digest

### Requirement: Relationship data is loaded once per run
The load-once rule SHALL state that a relationship artifact already present in the run's context is
never re-read, and that follow-up questions are answered from the loaded data.

#### Scenario: Second question reuses loaded data
- **WHEN** a run has already loaded `component-usage.toon` and a follow-up question needs the same
  data
- **THEN** the rule SHALL direct the agent to reuse it rather than re-read the artifact

### Requirement: Selection follows the atomic hierarchy
The selection rule SHALL direct the agent to look for an existing organism first, then a molecule,
then an atom, and to propose a new component only when nothing in the system fits — and, in that
case, to state explicitly what did not fit.

#### Scenario: Existing organism wins
- **WHEN** a requested section is already covered by an existing organism
- **THEN** the agent SHALL compose with that organism rather than assembling it from atoms

#### Scenario: A genuine gap is named
- **WHEN** no existing component fits a requirement
- **THEN** the agent SHALL flag the gap and name the components it evaluated and rejected

### Requirement: The light page path receives selection intent
The light design manifest SHALL carry, per component, a framework-free hints block containing the
component's `selectionCriteria`, its variant `purpose` map, and its anti-patterns. The light page
authoring prompt SHALL carry this intent for the components it is permitted to use, so composition
is guided by the system's decisions rather than inferred. The manifest SHALL remain free of
framework pointers.

#### Scenario: Hints reach the light page prompt
- **WHEN** a light page is composed against a design system whose components have metadata
- **THEN** the prompt SHALL carry selection criteria and anti-patterns for each component it may use

#### Scenario: Manifest stays framework-free
- **WHEN** the manifest is serialized with hints included
- **THEN** the framework-pointer guard SHALL still find no framework pointers
- **AND** serialization SHALL fail rather than emit a manifest that leaks one

#### Scenario: Components without metadata still compose
- **WHEN** a component has no metadata record yet
- **THEN** it SHALL still appear in the manifest with its stand-in and no hints block
- **AND** light page composition SHALL NOT be blocked

### Requirement: Structured context replaces truncated prose
Where a run previously received a byte-truncated slice of the design manifest prose, it SHALL
instead receive the structured digest and the metadata records for components in scope. Design
manifest prose SHALL NOT be cut at an arbitrary character boundary.

#### Scenario: No arbitrary truncation
- **WHEN** a compose run is built for a project whose design manifest exceeds the former slice
  length
- **THEN** the prompt SHALL carry the structured digest
- **AND** SHALL NOT carry a mid-sentence truncation of the manifest prose

### Requirement: The vendored design-system skills are reachable from runs
The vendored metadata-generation, composition-reasoning, and codebase-indexing skills SHALL be
invoked by the runs they serve — metadata generation for the metadata store, composition reasoning
for compose and light page runs — rather than remaining installed and unreferenced.

#### Scenario: Composition reasoning is applied
- **WHEN** a compose run selects components
- **THEN** it SHALL apply the composition-reasoning skill's selection method

#### Scenario: Metadata generation is delegated
- **WHEN** metadata is generated for components lacking records
- **THEN** the metadata-generation skill SHALL produce the analysis-derived sections
