## ADDED Requirements

### Requirement: DESIGN.md references consumed code for consume sources
When DESIGN.md is generated for a consume-source project, its component references SHALL point at the consumed code — the pointer import path (package specifier or alias-resolved copied file) plus the vendor's own docs/Storybook URL — and SHALL NOT emit local `component_dir` source paths, `.variants.ts` files, or a VortSpec `localhost:6006` Storybook URL that does not exist for that project.

#### Scenario: Consume-source component references
- **WHEN** DESIGN.md is generated for a project consuming a component library
- **THEN** each component's reference is a real import pointer and the vendor's docs URL, verified against the consumed code rather than a locally built Storybook

### Requirement: DESIGN.md generation is optional for consume sources
For a consume source, generating DESIGN.md via `/design-doc` SHALL be optional — the pointer inventory and token source provide enough grounding to compose — and its absence SHALL NOT block screen creation.

#### Scenario: Composing without DESIGN.md
- **WHEN** a consume-source project has no DESIGN.md
- **THEN** screen composition still proceeds using the pointer inventory and tokens, and `/design-doc` is offered but not required
